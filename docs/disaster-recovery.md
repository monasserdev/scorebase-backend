# Disaster Recovery and Backup Procedures

## Overview

This document outlines the backup and restore procedures for the ScoreBase Backend API infrastructure. The system is designed with automated backups and point-in-time recovery capabilities to ensure data durability and business continuity.

## Recovery Objectives

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 1 hour

## Backup Configuration

### RDS PostgreSQL Database

**Automated Backups:**
- **Frequency**: Daily automated backups
- **Retention Period**: 7 days
- **Backup Window**: 03:00-04:00 UTC
- **Storage**: Automated backups stored in AWS-managed S3 buckets
- **Encryption**: All backups are encrypted at rest

**Manual Snapshots:**
- Manual snapshots can be created at any time
- Manual snapshots are retained indefinitely until explicitly deleted
- Recommended before major schema changes or deployments

### DynamoDB Event Store

**Point-in-Time Recovery (PITR):**
- **Status**: Enabled
- **Retention Period**: 35 days
- **Granularity**: Restore to any second within the retention period
- **Scope**: Entire table restoration

**On-Demand Backups:**
- Can be created manually at any time
- Retained until explicitly deleted
- Full table backup with consistent state

### S3 Event Archive Bucket

**Versioning:**
- **Status**: Enabled
- **Purpose**: Maintains multiple versions of each object
- **Retention**: All versions retained indefinitely
- **Recovery**: Can restore any previous version of archived events

**Lifecycle Policy:**
- Objects transition to Glacier storage class after 365 days
- Reduces storage costs while maintaining long-term archives

## Restoration Procedures

### 1. RDS PostgreSQL Restoration

#### Restore from Automated Backup

**Use Case**: Recover from data corruption or accidental deletion within the last 7 days

**Steps:**

1. **Identify the backup to restore:**
   ```bash
   aws rds describe-db-snapshots \
     --db-instance-identifier scorebase-database \
     --snapshot-type automated \
     --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
     --output table
   ```

2. **Restore the database to a new instance:**
   ```bash
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier scorebase-database-restored \
     --db-snapshot-identifier <snapshot-identifier> \
     --db-instance-class db.t3.medium \
     --vpc-security-group-ids <security-group-id> \
     --db-subnet-group-name <subnet-group-name> \
     --multi-az \
     --storage-encrypted
   ```

3. **Wait for restoration to complete:**
   ```bash
   aws rds wait db-instance-available \
     --db-instance-identifier scorebase-database-restored
   ```

4. **Update Lambda environment variables:**
   - Update `DB_HOST` to point to the restored instance endpoint
   - Redeploy the CDK stack or update Lambda configuration directly

5. **Verify data integrity:**
   - Connect to the restored database
   - Run validation queries to confirm data consistency
   - Test critical API endpoints

6. **Switch traffic to restored instance:**
   - Update DNS or load balancer configuration
   - Monitor application logs for errors

7. **Clean up old instance (after verification):**
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier scorebase-database \
     --skip-final-snapshot
   ```

**Estimated Time**: 30-60 minutes

#### Restore from Manual Snapshot

Follow the same procedure as automated backup restoration, but use `--snapshot-type manual` in step 1.

### 2. DynamoDB Point-in-Time Recovery

**Use Case**: Recover event store data from accidental deletion or corruption

**Steps:**

1. **Determine the restore point:**
   - Identify the timestamp before the incident occurred
   - Must be within the last 35 days
   - Format: ISO-8601 (e.g., `2024-01-15T14:30:00Z`)

2. **Restore to a new table:**
   ```bash
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name scorebase-game-events \
     --target-table-name scorebase-game-events-restored \
     --restore-date-time 2024-01-15T14:30:00Z \
     --use-latest-restorable-time false
   ```

3. **Wait for restoration to complete:**
   ```bash
   aws dynamodb describe-table \
     --table-name scorebase-game-events-restored \
     --query 'Table.TableStatus'
   ```

4. **Verify restored data:**
   ```bash
   aws dynamodb scan \
     --table-name scorebase-game-events-restored \
     --max-items 10
   ```

5. **Recreate Global Secondary Index (GSI):**
   ```bash
   aws dynamodb update-table \
     --table-name scorebase-game-events-restored \
     --attribute-definitions \
       AttributeName=tenant_id,AttributeType=S \
       AttributeName=occurred_at#event_id,AttributeType=S \
     --global-secondary-index-updates \
       '[{
         "Create": {
           "IndexName": "tenant-events-index",
           "KeySchema": [
             {"AttributeName": "tenant_id", "KeyType": "HASH"},
             {"AttributeName": "occurred_at#event_id", "KeyType": "RANGE"}
           ],
           "Projection": {"ProjectionType": "ALL"}
         }
       }]'
   ```

6. **Update Lambda environment variables:**
   - Update `DYNAMODB_TABLE_NAME` to `scorebase-game-events-restored`
   - Redeploy Lambda function

7. **Verify event retrieval:**
   - Test API endpoints: `GET /v1/games/{gameId}/events`
   - Verify events are returned correctly

8. **Switch to restored table (after verification):**
   - Delete original table (optional, after backup)
   - Rename restored table to original name (requires recreation)

**Estimated Time**: 1-2 hours

### 3. S3 Event Archive Recovery

**Use Case**: Replay events from long-term archive or recover deleted event files

#### Restore Deleted Object

**Steps:**

1. **List object versions:**
   ```bash
   aws s3api list-object-versions \
     --bucket scorebase-event-archives-<account-id> \
     --prefix events/2024/01/15/
   ```

2. **Restore specific version:**
   ```bash
   aws s3api copy-object \
     --bucket scorebase-event-archives-<account-id> \
     --copy-source scorebase-event-archives-<account-id>/events/2024/01/15/game-123.json?versionId=<version-id> \
     --key events/2024/01/15/game-123.json
   ```

**Estimated Time**: 5-10 minutes

#### Restore from Glacier

**Steps:**

1. **Initiate restore request:**
   ```bash
   aws s3api restore-object \
     --bucket scorebase-event-archives-<account-id> \
     --key events/2023/01/15/game-123.json \
     --restore-request Days=7,GlacierJobParameters={Tier=Standard}
   ```

2. **Wait for restoration (3-5 hours for Standard tier)**

3. **Download restored object:**
   ```bash
   aws s3 cp \
     s3://scorebase-event-archives-<account-id>/events/2023/01/15/game-123.json \
     ./restored-events/
   ```

**Estimated Time**: 3-5 hours (Standard tier), 1-5 minutes (Expedited tier, additional cost)

### 4. Event Replay from Archive

**Use Case**: Rebuild game state or standings from event history

**Steps:**

1. **Download event archive for specific game:**
   ```bash
   aws s3 cp \
     s3://scorebase-event-archives-<account-id>/events/game-<game-id>/ \
     ./event-replay/ \
     --recursive
   ```

2. **Parse and sort events chronologically:**
   ```bash
   # Example using jq
   cat ./event-replay/*.json | jq -s 'sort_by(.occurred_at)'
   ```

3. **Replay events through API:**
   ```bash
   # For each event in chronological order
   curl -X POST https://api.scorebase.com/v1/games/<game-id>/events \
     -H "Authorization: Bearer <jwt-token>" \
     -H "Content-Type: application/json" \
     -d @event.json
   ```

4. **Verify game state and standings:**
   - Check game scores: `GET /v1/games/{gameId}`
   - Check standings: `GET /v1/seasons/{seasonId}/standings`

**Estimated Time**: 30 minutes - 2 hours (depending on event volume)

## Disaster Recovery Scenarios

### Scenario 1: Complete Region Failure

**Impact**: All services unavailable

**Recovery Steps:**

1. Deploy CDK stack to secondary region
2. Restore RDS from latest snapshot to new region
3. Restore DynamoDB table using on-demand backup
4. Update DNS to point to new region
5. Verify all services operational

**Estimated RTO**: 4 hours

### Scenario 2: Database Corruption

**Impact**: Invalid data in RDS PostgreSQL

**Recovery Steps:**

1. Identify corruption timestamp
2. Restore RDS from automated backup before corruption
3. Replay DynamoDB events from corruption point forward
4. Recalculate standings for affected seasons
5. Verify data integrity

**Estimated RTO**: 2 hours

### Scenario 3: Accidental Data Deletion

**Impact**: Missing games, teams, or events

**Recovery Steps:**

1. Restore RDS from latest backup (if operational data deleted)
2. Restore DynamoDB using PITR (if events deleted)
3. Verify restored data matches expected state
4. Resume normal operations

**Estimated RTO**: 1-2 hours

## Backup Verification

### Monthly Backup Testing

**Schedule**: First Monday of each month

**Procedure:**

1. Restore RDS snapshot to test instance
2. Restore DynamoDB table to test table
3. Run validation queries against restored data
4. Document results and any issues
5. Delete test resources

### Quarterly Disaster Recovery Drill

**Schedule**: First week of each quarter

**Procedure:**

1. Simulate complete region failure
2. Execute full disaster recovery procedure
3. Measure actual RTO and RPO
4. Document lessons learned
5. Update procedures as needed

## Monitoring and Alerts

### Backup Monitoring

**CloudWatch Alarms:**

- RDS backup failure
- DynamoDB backup failure
- S3 replication lag

**Notifications:**

- Email to ops team
- PagerDuty alert for critical failures

### Backup Metrics

**Track:**

- Backup success rate
- Backup duration
- Backup size
- Restore test success rate

## Security Considerations

### Backup Encryption

- All RDS backups encrypted with AWS KMS
- All DynamoDB backups encrypted with AWS-managed keys
- All S3 objects encrypted at rest

### Access Control

- Backup restoration requires IAM role with specific permissions
- Multi-factor authentication required for production restores
- All restore operations logged to CloudTrail

### Compliance

- Backups retained per regulatory requirements
- Backup access audited quarterly
- Encryption keys rotated annually

## Contact Information

**Escalation Path:**

1. On-call engineer (PagerDuty)
2. DevOps lead
3. CTO

**Emergency Contacts:**

- DevOps Team: devops@scorebase.com
- Security Team: security@scorebase.com
- AWS Support: Enterprise Support Plan

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | DevOps Team | Initial documentation |

## References

- [AWS RDS Backup and Restore](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.BackupRestore.html)
- [DynamoDB Point-in-Time Recovery](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.html)
- [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [AWS Disaster Recovery](https://aws.amazon.com/disaster-recovery/)
