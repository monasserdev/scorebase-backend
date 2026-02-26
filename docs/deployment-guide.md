# ScoreBase Backend API - Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the ScoreBase Backend API to AWS environments. The backend uses AWS CDK for infrastructure as code and supports multiple environments (dev, staging, production).

## Prerequisites

### Required Tools
- Node.js 20.x LTS or higher
- AWS CLI v2 configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- PostgreSQL client (for database verification)
- Git

### AWS Account Requirements
- AWS account with appropriate permissions
- IAM user or role with permissions for:
  - Lambda, API Gateway, RDS, DynamoDB, S3, VPC, CloudWatch
  - Cognito User Pools
  - Secrets Manager
  - CloudFormation

### Environment Variables
Create a `.env` file for each environment (not committed to git):

```bash
# Database Configuration
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=scorebase
DB_USER=scorebase_admin
DB_PASSWORD=your-secure-password

# AWS Configuration
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=your-client-id

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=scorebase-events-staging
DYNAMODB_GSI_NAME=tenant-events-index

# S3 Configuration
S3_EVENT_ARCHIVE_BUCKET=scorebase-events-archive-staging

# Environment
NODE_ENV=staging
LOG_LEVEL=info
```

## Deployment Environments

### Development (dev)
- Purpose: Local development and testing
- Database: Smaller RDS instance (db.t3.micro)
- No provisioned concurrency
- Relaxed monitoring thresholds

### Staging
- Purpose: Pre-production testing and validation
- Database: Medium RDS instance (db.t3.medium)
- Minimal provisioned concurrency (2 instances)
- Production-like configuration
- Used for smoke tests and integration testing

### Production
- Purpose: Live customer-facing environment
- Database: Production-grade RDS (db.t3.large or higher, Multi-AZ)
- Provisioned concurrency (5 instances)
- Strict monitoring and alerting
- Automated backups with 7-day retention

## Pre-Deployment Checklist

- [ ] All tests passing (`npm run test:all`)
- [ ] Code coverage meets 80% threshold
- [ ] Environment variables configured
- [ ] AWS credentials configured (`aws configure`)
- [ ] CDK bootstrapped in target account/region
- [ ] Database migration scripts reviewed
- [ ] Secrets stored in AWS Secrets Manager
- [ ] Monitoring dashboards configured

## Deployment Steps

### 1. Bootstrap CDK (First Time Only)

```bash
# Bootstrap CDK in your AWS account and region
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example:
cdk bootstrap aws://123456789012/us-east-1
```

### 2. Build the Application

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run tests
npm run test:all

# Build TypeScript to JavaScript
npm run build
```

### 3. Synthesize CloudFormation Template

```bash
# Generate CloudFormation template
npm run cdk:synth

# Review the generated template in cdk.out/
```

### 4. Review Infrastructure Changes

```bash
# Preview changes before deployment
npm run cdk:diff

# For staging environment
cdk diff --context environment=staging
```

### 5. Deploy Infrastructure

#### Staging Deployment
```bash
# Deploy to staging
npm run deploy:staging

# This runs:
# 1. npm run build
# 2. npm run cdk:synth
# 3. cdk deploy --context environment=staging
# 4. npm run migrate:up
```

#### Production Deployment
```bash
# Deploy to production (requires all tests to pass)
npm run deploy:production

# This runs:
# 1. npm run test:all (must pass)
# 2. npm run build
# 3. npm run cdk:synth
# 4. cdk deploy --context environment=production --require-approval never
# 5. npm run migrate:up
```

### 6. Run Database Migrations

```bash
# Check migration status
npm run migrate:status

# Run pending migrations
npm run migrate:up

# Rollback last migration (if needed)
npm run migrate:down
```

### 7. Verify Deployment

```bash
# Get API Gateway endpoint from CDK output
aws cloudformation describe-stacks \
  --stack-name ScorebaseBackendStack-staging \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text

# Test health endpoint
curl https://your-api-endpoint.execute-api.us-east-1.amazonaws.com/v1/health
```

## Post-Deployment Verification

### 1. Infrastructure Verification
- [ ] Lambda function deployed and accessible
- [ ] API Gateway endpoint responding
- [ ] RDS database accessible from Lambda
- [ ] DynamoDB table created with GSI
- [ ] S3 bucket created with lifecycle policies
- [ ] Cognito User Pool configured
- [ ] CloudWatch alarms active

### 2. Functional Verification
- [ ] Authentication working (JWT validation)
- [ ] API endpoints responding correctly
- [ ] Database queries executing successfully
- [ ] Event sourcing to DynamoDB working
- [ ] Standings calculation functioning
- [ ] Multi-tenant isolation enforced

### 3. Monitoring Verification
- [ ] CloudWatch Logs receiving log entries
- [ ] Custom metrics being emitted
- [ ] Alarms configured and active
- [ ] Dashboard displaying metrics

## Rollback Procedures

### Application Rollback
```bash
# Rollback to previous Lambda version
aws lambda update-function-code \
  --function-name scorebase-api-staging \
  --s3-bucket your-deployment-bucket \
  --s3-key previous-version.zip

# Or redeploy previous CDK version
git checkout <previous-commit>
npm run deploy:staging
```

### Database Rollback
```bash
# Rollback last migration
npm run migrate:down

# Rollback to specific version
npm run migrate:down -- --count 2
```

### Full Stack Rollback
```bash
# Destroy entire stack (use with caution!)
cdk destroy --context environment=staging

# Redeploy from previous version
git checkout <previous-commit>
npm run deploy:staging
```

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Error
```
Error: This stack uses assets, so the toolkit stack must be deployed
```
**Solution:** Run `cdk bootstrap` in your account/region

#### 2. Lambda Timeout
```
Task timed out after 30.00 seconds
```
**Solution:** Increase Lambda timeout in CDK stack or optimize database queries

#### 3. Database Connection Error
```
Error: connect ETIMEDOUT
```
**Solution:** 
- Verify Lambda is in VPC with RDS access
- Check security group rules
- Verify database credentials in Secrets Manager

#### 4. Migration Failure
```
Error: relation "leagues" already exists
```
**Solution:** Check migration status and skip completed migrations

#### 5. Authentication Failure
```
Error: Invalid JWT token
```
**Solution:**
- Verify Cognito User Pool ID and Client ID
- Check JWT token expiration
- Verify public keys are cached correctly

### Debug Commands

```bash
# View Lambda logs
aws logs tail /aws/lambda/scorebase-api-staging --follow

# Check Lambda function configuration
aws lambda get-function-configuration \
  --function-name scorebase-api-staging

# Test database connectivity
psql -h your-rds-endpoint.rds.amazonaws.com \
  -U scorebase_admin -d scorebase

# Check DynamoDB table
aws dynamodb describe-table \
  --table-name scorebase-events-staging

# View CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=scorebase-api-staging \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average
```

## Security Considerations

### Secrets Management
- Never commit secrets to git
- Use AWS Secrets Manager for database credentials
- Rotate secrets regularly (90-day policy)
- Use IAM roles for Lambda, not access keys

### Network Security
- Lambda in private VPC subnets
- RDS in private subnets with security groups
- API Gateway with Cognito authorizer
- VPC endpoints for AWS service communication

### Monitoring and Auditing
- Enable CloudTrail for API audit logs
- Monitor CloudWatch Logs for security violations
- Set up alerts for cross-tenant access attempts
- Review IAM policies regularly

## Performance Optimization

### Lambda Optimization
- Use provisioned concurrency for production (5 instances)
- Optimize cold start time (< 1 second)
- Reuse database connections across invocations
- Monitor memory usage and right-size

### Database Optimization
- Use connection pooling (min 5, max 20)
- Add indexes on frequently queried columns
- Monitor slow query logs
- Use read replicas for read-heavy workloads (future)

### API Gateway Optimization
- Enable caching for GET endpoints (future)
- Use throttling to prevent abuse (1000 req/sec per tenant)
- Monitor latency metrics (target < 200ms p95)

## Cost Optimization

### Current Configuration
- **Lambda**: Pay per request + provisioned concurrency
- **RDS**: Reserved instance for production (save 40%)
- **DynamoDB**: On-demand billing mode
- **S3**: Lifecycle policy to Glacier after 365 days
- **CloudWatch Logs**: 30-day retention

### Cost Monitoring
```bash
# View cost allocation by tag
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Environment
```

## Maintenance Windows

### Recommended Schedule
- **Staging**: Anytime (no customer impact)
- **Production**: Sunday 2:00 AM - 4:00 AM UTC (low traffic)

### Maintenance Tasks
- Database migrations (test in staging first)
- Lambda function updates
- Security patches
- Configuration changes

## Support and Escalation

### Monitoring Alerts
- Lambda error rate > 10 errors in 2 periods → Page on-call engineer
- API Gateway 5xx errors → Investigate immediately
- RDS connection count > 80 → Scale up or investigate leaks
- Lambda duration > 3000ms → Optimize queries

### Escalation Path
1. Check CloudWatch Logs and metrics
2. Review recent deployments (rollback if needed)
3. Check AWS Service Health Dashboard
4. Contact AWS Support (if infrastructure issue)

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [RDS PostgreSQL Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [ScoreBase Backend Architecture](./architecture.md)
- [Disaster Recovery Guide](./disaster-recovery.md)
- [Security Configuration](./security-configuration.md)
