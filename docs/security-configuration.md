# Security Configuration

This document describes the security hardening measures implemented in the ScoreBase Backend API infrastructure.

## Task 13.1: Input Validation at API Gateway

### Request Validators

The API Gateway is configured with request validators that enforce:

- **Body Validation**: All request bodies are validated against JSON schemas
- **Parameter Validation**: Path parameters, query parameters, and headers are validated

### JSON Schema Models

#### Event Request Model

The `EventRequestModel` validates POST requests to `/v1/games/{gameId}/events`:

```json
{
  "type": "object",
  "required": ["event_type", "payload"],
  "properties": {
    "event_type": {
      "type": "string",
      "enum": [
        "GAME_STARTED",
        "GOAL_SCORED",
        "PENALTY_ASSESSED",
        "PERIOD_ENDED",
        "GAME_FINALIZED",
        "GAME_CANCELLED",
        "SCORE_CORRECTED"
      ]
    },
    "payload": {
      "type": "object"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "maxLength": 256
        },
        "ip_address": {
          "type": "string",
          "maxLength": 45
        }
      }
    }
  },
  "additionalProperties": false
}
```

### Security Benefits

- **DoS Prevention**: String length limits prevent oversized payloads
- **Type Safety**: Ensures correct data types are submitted
- **Enum Validation**: Only valid event types are accepted
- **Schema Enforcement**: `additionalProperties: false` prevents injection of unexpected fields

## Task 13.2: Encryption and Secrets Management

### Encryption at Rest

All data stores have encryption enabled:

#### RDS PostgreSQL
- **Encryption**: Enabled via `storageEncrypted: true`
- **Key Management**: AWS-managed encryption keys
- **Backup Encryption**: Automated backups are also encrypted

#### DynamoDB
- **Encryption**: Enabled via `TableEncryption.AWS_MANAGED`
- **Key Management**: AWS-managed encryption keys
- **Point-in-Time Recovery**: Enabled with encrypted backups

#### S3 Event Archive Bucket
- **Encryption**: Enabled via `BucketEncryption.S3_MANAGED`
- **Versioning**: Enabled for data protection
- **Lifecycle Policy**: Transitions to Glacier after 365 days (encrypted)

### Secrets Management

#### Database Credentials

Database credentials are stored in **AWS Secrets Manager**:

- **Secret Name**: `scorebase/db/credentials`
- **Auto-Generated**: Password is automatically generated (32 characters, no punctuation)
- **Rotation**: Can be configured for automatic rotation
- **Access Control**: Lambda function has read-only access via IAM policy

#### Lambda Environment Variables

The Lambda function receives the secret ARN (not the actual credentials):

```typescript
DB_SECRET_ARN: dbCredentials.secretArn
```

The application code retrieves credentials at runtime using the AWS SDK:

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
);
const credentials = JSON.parse(response.SecretString);
```

### Security Benefits

- **No Hardcoded Credentials**: Credentials never appear in code or environment variables
- **Encryption in Transit**: Secrets Manager uses TLS for all communications
- **Audit Trail**: All secret access is logged to CloudTrail
- **Rotation Support**: Secrets can be rotated without code changes

## Task 13.3: VPC and Network Security

### VPC Configuration

The infrastructure uses a multi-tier VPC architecture:

- **Availability Zones**: 2 AZs for high availability
- **NAT Gateways**: 1 NAT gateway for cost optimization
- **Subnets**:
  - **Public Subnets**: For NAT gateway and future load balancers
  - **Private Subnets with Egress**: For Lambda functions (can reach internet via NAT)
  - **Isolated Subnets**: For RDS database (no internet access)

### Security Groups

#### Database Security Group

- **Inbound Rules**: Only allows connections from Lambda security group on port 5432
- **Outbound Rules**: No outbound traffic allowed (`allowAllOutbound: false`)

#### Lambda Security Group

- **Inbound Rules**: None (Lambda doesn't accept inbound connections)
- **Outbound Rules**: All outbound traffic allowed (for API calls to AWS services)

### VPC Endpoints

VPC endpoints enable private communication with AWS services without traversing the internet:

#### Gateway Endpoints

- **DynamoDB Endpoint**: Lambda can access DynamoDB without NAT gateway
- **S3 Endpoint**: Lambda can access S3 without NAT gateway

#### Interface Endpoints

- **Secrets Manager Endpoint**: Lambda retrieves database credentials privately
  - **Private DNS**: Enabled for seamless integration
  - **Subnets**: Deployed in private subnets with Lambda

### Network Isolation

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   API Gateway        │
              │   (Public Endpoint)  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Lambda Function    │
              │   (Private Subnet)   │
              └──┬───────────────┬───┘
                 │               │
        ┌────────▼─────┐    ┌───▼──────────┐
        │ RDS Database │    │ VPC Endpoints│
        │  (Isolated)  │    │ (DynamoDB,   │
        │              │    │  S3, Secrets)│
        └──────────────┘    └──────────────┘
```

### Security Benefits

- **Defense in Depth**: Multiple layers of network isolation
- **Least Privilege**: Database only accessible from Lambda
- **Private Communication**: AWS service calls don't traverse internet
- **Cost Optimization**: Gateway endpoints reduce NAT gateway data transfer costs
- **Compliance**: Meets requirements for private network architectures

## Additional Security Measures

### Cognito Authentication

- **JWT Validation**: All API requests require valid JWT tokens
- **Custom Attributes**: `tenant_id` stored in token claims for multi-tenant isolation
- **Password Policy**: Strong password requirements (12+ chars, mixed case, digits, symbols)
- **Token Expiration**: Access tokens expire after 1 hour

### API Gateway Security

- **Throttling**: 1000 requests/second rate limit, 2000 burst limit
- **CORS**: Configured to allow cross-origin requests with credentials
- **Logging**: Full request/response logging enabled for audit trail

### CloudWatch Monitoring

Security-related alarms:

- **Lambda Errors**: Alerts on high error rates (potential attacks)
- **API 5xx Errors**: Alerts on server errors
- **RDS Connections**: Alerts on connection exhaustion (potential DoS)

## Compliance Considerations

The security configuration supports compliance with:

- **GDPR**: Encryption at rest and in transit, audit logging
- **HIPAA**: Encryption, access controls, audit trails (if applicable)
- **SOC 2**: Security monitoring, access controls, encryption
- **PCI DSS**: Network isolation, encryption, access controls (if handling payment data)

## Security Best Practices

### Implemented

✅ Encryption at rest for all data stores
✅ Secrets stored in AWS Secrets Manager
✅ Network isolation with VPC and security groups
✅ VPC endpoints for private AWS service communication
✅ Input validation at API Gateway
✅ JWT authentication with Cognito
✅ Rate limiting and throttling
✅ Comprehensive logging and monitoring

### Future Enhancements

- [ ] Enable AWS WAF for additional protection against common attacks
- [ ] Implement AWS Shield for DDoS protection
- [ ] Enable GuardDuty for threat detection
- [ ] Configure AWS Config for compliance monitoring
- [ ] Implement automated secret rotation
- [ ] Add AWS KMS customer-managed keys for enhanced encryption control
- [ ] Enable VPC Flow Logs for network traffic analysis

## Testing Security Configuration

### Verify Encryption

```bash
# Check RDS encryption
aws rds describe-db-instances \
  --db-instance-identifier <instance-id> \
  --query 'DBInstances[0].StorageEncrypted'

# Check DynamoDB encryption
aws dynamodb describe-table \
  --table-name scorebase-game-events \
  --query 'Table.SSEDescription'

# Check S3 encryption
aws s3api get-bucket-encryption \
  --bucket scorebase-event-archives-<account-id>
```

### Verify Secrets Manager

```bash
# List secrets
aws secretsmanager list-secrets \
  --query 'SecretList[?Name==`scorebase/db/credentials`]'

# Verify Lambda has access
aws lambda get-function \
  --function-name scorebase-api \
  --query 'Configuration.Environment.Variables.DB_SECRET_ARN'
```

### Verify VPC Configuration

```bash
# List VPC endpoints
aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=<vpc-id>" \
  --query 'VpcEndpoints[*].[ServiceName,State]'

# Verify security groups
aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=<vpc-id>" \
  --query 'SecurityGroups[*].[GroupName,GroupId]'
```

## Incident Response

In case of security incidents:

1. **Immediate Actions**:
   - Review CloudWatch Logs for suspicious activity
   - Check CloudTrail for unauthorized API calls
   - Verify security group rules haven't been modified
   - Rotate compromised credentials in Secrets Manager

2. **Investigation**:
   - Analyze VPC Flow Logs (if enabled)
   - Review API Gateway access logs
   - Check Lambda execution logs
   - Examine database audit logs

3. **Remediation**:
   - Update security group rules if needed
   - Rotate all credentials
   - Apply security patches
   - Update WAF rules (if enabled)

## References

- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [VPC Security Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html)
