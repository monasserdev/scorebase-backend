# ScoreBase Backend - Quick Start Guide

## What You Have

You've built a complete, production-ready backend API with:
- ✅ AWS serverless infrastructure (Lambda, API Gateway, RDS, DynamoDB, Cognito)
- ✅ Multi-tenant architecture with JWT authentication
- ✅ Event sourcing for game events
- ✅ Automated standings calculation
- ✅ 445 passing tests with 80% coverage
- ✅ Complete documentation

## What Happens Next

To connect your iOS app to this backend, you need to:

1. **Deploy the backend to AWS** (creates all infrastructure)
2. **Get the API endpoint URL** (from deployment output)
3. **Configure your iOS app** (update base URL and Cognito settings)
4. **Test the integration** (run E2E tests)

---

## Step 1: Prerequisites

### Install Required Tools

```bash
# Install AWS CLI
brew install awscli

# Install AWS CDK
npm install -g aws-cdk

# Verify installations
aws --version
cdk --version
node --version  # Should be 20.x
```

### Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# You'll be prompted for:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
# - Default output format (json)
```

**Don't have AWS credentials?**
1. Go to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to IAM → Users → Your User → Security Credentials
3. Create Access Key
4. Save the Access Key ID and Secret Access Key

---

## Step 2: Deploy to AWS

### Bootstrap CDK (First Time Only)

```bash
# Bootstrap CDK in your AWS account
cdk bootstrap aws://YOUR-ACCOUNT-ID/us-east-1

# Don't know your account ID?
aws sts get-caller-identity --query Account --output text
```

### Deploy to Staging

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy to staging
npm run deploy:staging
```

**This will create:**
- ✅ VPC with public/private subnets
- ✅ RDS PostgreSQL database (Multi-AZ, encrypted)
- ✅ DynamoDB table for events
- ✅ S3 bucket for event archives
- ✅ Cognito User Pool for authentication
- ✅ Lambda function with your API code
- ✅ API Gateway with /v1/ endpoints
- ✅ CloudWatch alarms and monitoring

**Deployment takes:** ~15-20 minutes (RDS takes the longest)

### Deployment Output

After deployment completes, you'll see:

```
✅ ScorebaseBackendStack-staging

Outputs:
ScorebaseBackendStack-staging.APIEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/v1/
ScorebaseBackendStack-staging.UserPoolId = us-east-1_ABC123XYZ
ScorebaseBackendStack-staging.UserPoolClientId = 1a2b3c4d5e6f7g8h9i0j
ScorebaseBackendStack-staging.DatabaseEndpoint = scorebase-db.abc123.us-east-1.rds.amazonaws.com

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/ScorebaseBackendStack-staging/...
```

**Save these values!** You'll need them for iOS integration.

---

## Step 3: Run Database Migrations

```bash
# Set database connection details from deployment output
export DB_HOST=scorebase-db.abc123.us-east-1.rds.amazonaws.com
export DB_PORT=5432
export DB_NAME=scorebase
export DB_USER=scorebase_admin
export DB_PASSWORD=<get-from-secrets-manager>

# Get password from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id scorebase/db/credentials \
  --query SecretString \
  --output text | jq -r .password

# Run migrations
npm run migrate:up
```

**This creates:**
- Tenants, leagues, seasons, teams, players tables
- Games and standings tables
- Indexes for performance
- Foreign key constraints

---

## Step 4: Create Test User in Cognito

```bash
# Create a test user
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123XYZ \
  --username test@example.com \
  --user-attributes \
    Name=email,Value=test@example.com \
    Name=custom:tenant_id,Value=$(uuidgen) \
  --temporary-password TempPassword123! \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ABC123XYZ \
  --username test@example.com \
  --password TestPassword123! \
  --permanent

# Add to scorekeeper group (for creating events)
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_ABC123XYZ \
  --username test@example.com \
  --group-name scorekeeper
```

---

## Step 5: Test the API

### Test Authentication

```bash
# Get JWT token
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 1a2b3c4d5e6f7g8h9i0j \
  --auth-parameters \
    USERNAME=test@example.com,PASSWORD=TestPassword123! \
  | jq -r .AuthenticationResult.AccessToken

# Save the token
export JWT_TOKEN=<token-from-above>
```

### Test API Endpoints

```bash
# Test GET /leagues
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://abc123.execute-api.us-east-1.amazonaws.com/v1/leagues

# Expected response:
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": []
}
```

### View API Documentation

```bash
# Open in browser
open https://abc123.execute-api.us-east-1.amazonaws.com/api-docs
```

---

## Step 6: Connect iOS App

### Update iOS Configuration

In your iOS app's `core-networking` package:

```swift
// Packages/core-networking/Sources/CoreNetworking/Configuration/APIConfiguration.swift

public struct APIConfiguration {
    public static var staging: APIConfiguration {
        APIConfiguration(
            baseURL: URL(string: "https://abc123.execute-api.us-east-1.amazonaws.com/v1")!,
            cognitoUserPoolId: "us-east-1_ABC123XYZ",
            cognitoClientId: "1a2b3c4d5e6f7g8h9i0j",
            region: "us-east-1"
        )
    }
}
```

### Test iOS Integration

```swift
// In your iOS app
let config = APIConfiguration.staging
let authManager = CognitoAuthenticationManager(
    userPoolId: config.cognitoUserPoolId,
    clientId: config.cognitoClientId,
    region: config.region
)

// Sign in
let token = try await authManager.signIn(
    username: "test@example.com",
    password: "TestPassword123!"
)

// Fetch leagues
let apiClient = ScoreBaseAPIClient(
    configuration: config,
    authManager: authManager
)

let (leagues, requestId) = try await apiClient.request(GetLeaguesEndpoint())
print("Fetched \\(leagues.count) leagues, Request ID: \\(requestId)")
```

---

## Step 7: Seed Test Data (Optional)

```bash
# Connect to database
psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Create test league
INSERT INTO leagues (league_id, tenant_id, name, sport_type)
VALUES (
  gen_random_uuid(),
  '<your-tenant-id>',
  'Test Basketball League',
  'basketball'
);

# Create test season
INSERT INTO seasons (season_id, league_id, name, start_date, end_date, is_active)
VALUES (
  gen_random_uuid(),
  '<league-id-from-above>',
  '2024 Season',
  '2024-01-01',
  '2024-12-31',
  true
);

# Exit
\q
```

---

## Common Issues & Solutions

### Issue: CDK Bootstrap Error

```
Error: This stack uses assets, so the toolkit stack must be deployed
```

**Solution:**
```bash
cdk bootstrap aws://YOUR-ACCOUNT-ID/us-east-1
```

### Issue: Insufficient Permissions

```
Error: User is not authorized to perform: cloudformation:CreateStack
```

**Solution:** Your AWS user needs these permissions:
- CloudFormation (full)
- Lambda (full)
- API Gateway (full)
- RDS (full)
- DynamoDB (full)
- Cognito (full)
- VPC (full)
- IAM (create roles)

Ask your AWS admin to grant these permissions.

### Issue: Database Connection Timeout

```
Error: connect ETIMEDOUT
```

**Solution:** Lambda is in VPC and needs time to establish connection. This is normal on first request (cold start). Subsequent requests will be faster.

### Issue: Migration Fails

```
Error: relation "leagues" already exists
```

**Solution:** Migrations already ran. Check status:
```bash
npm run migrate:status
```

---

## Cost Estimate

**Staging Environment (Low Traffic):**
- Lambda: ~$5-10/month
- RDS (db.t3.medium): ~$50-70/month
- DynamoDB (on-demand): ~$1-5/month
- API Gateway: ~$3.50 per million requests
- Other services: ~$5-10/month

**Total: ~$65-100/month for staging**

**Cost Optimization:**
- Use smaller RDS instance for dev (db.t3.micro)
- Stop RDS when not in use
- Use Lambda provisioned concurrency only in production
- Enable S3 lifecycle policies (already configured)

---

## Next Steps

### 1. Production Deployment

When ready for production:

```bash
# Deploy to production
npm run deploy:production

# This includes:
# - All tests must pass
# - Larger RDS instance (db.t3.large)
# - Multi-AZ enabled
# - Provisioned concurrency (5 instances)
# - Production-grade monitoring
```

### 2. Custom Domain

Set up custom domain:

```bash
# In Route 53
api.scorebase.com → API Gateway endpoint

# Update iOS app
baseURL = "https://api.scorebase.com/v1"
```

### 3. Monitoring

Access CloudWatch dashboards:
- Lambda metrics (errors, duration, invocations)
- API Gateway metrics (requests, latency, errors)
- RDS metrics (connections, CPU, storage)
- Custom business metrics (events, standings calculations)

### 4. CI/CD

Set up GitHub Actions for automated deployment:
- Tests run on every PR
- Auto-deploy to staging on merge to main
- Manual approval for production deployment

---

## Getting Help

### Documentation
- [Deployment Guide](./deployment-guide.md) - Detailed deployment instructions
- [iOS Integration Guide](./ios-integration-guide.md) - iOS app integration
- [API Documentation](./API_DOCUMENTATION.md) - API reference
- [Smoke Testing Guide](./smoke-testing-guide.md) - Testing procedures

### Support
- **Email**: engineering@scorebase.com
- **GitHub Issues**: https://github.com/scorebase/backend/issues
- **AWS Support**: https://console.aws.amazon.com/support/

### Useful Commands

```bash
# View CloudWatch logs
aws logs tail /aws/lambda/scorebase-api-staging --follow

# Check API Gateway endpoint
aws apigateway get-rest-apis

# Check RDS status
aws rds describe-db-instances --db-instance-identifier scorebase-db

# Check DynamoDB table
aws dynamodb describe-table --table-name scorebase-game-events

# Destroy stack (careful!)
cdk destroy --context environment=staging
```

---

## Summary

You now have:
1. ✅ Backend deployed to AWS
2. ✅ API endpoint URL for iOS app
3. ✅ Cognito authentication configured
4. ✅ Database with schema ready
5. ✅ Test user created
6. ✅ API documentation available

**Your iOS app can now connect to the backend!**

Follow the [iOS Integration Guide](./ios-integration-guide.md) for detailed iOS app setup.
