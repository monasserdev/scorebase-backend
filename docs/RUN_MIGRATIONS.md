# Running Database Migrations

The database schema needs to be initialized before the API can serve requests. Since the RDS database is in a private VPC, migrations must be run from within the VPC.

## Option 1: Invoke Lambda Function (Recommended)

The easiest way is to invoke the Lambda function with a special payload that triggers the migration script.

### Step 1: Build and package the migration script

```bash
npm run build
./scripts/package-lambda.sh
cp -r docs lambda-package/
```

### Step 2: Update Lambda with migration script

```bash
cd lambda-package
zip -r ../lambda-deployment.zip . > /dev/null
cd ..

aws lambda update-function-code \
  --function-name scorebase-api \
  --zip-file fileb://lambda-deployment.zip \
  --region us-east-1
```

### Step 3: Invoke the migration runner

Create a test event file `migration-event.json`:

```json
{
  "httpMethod": "POST",
  "path": "/admin/migrate",
  "headers": {},
  "body": "{}"
}
```

Then invoke the Lambda:

```bash
aws lambda invoke \
  --function-name scorebase-api \
  --payload file://migration-event.json \
  --region us-east-1 \
  migration-response.json

cat migration-response.json
```

## Option 2: Use AWS Systems Manager Session Manager

If you need more control, you can use AWS Systems Manager to connect to a bastion host in the VPC and run migrations from there.

### Step 1: Create a bastion host (EC2 instance) in the VPC

```bash
# This would require additional CDK/CloudFormation configuration
# Not recommended for quick setup
```

### Step 2: Connect via Session Manager

```bash
aws ssm start-session --target <instance-id>
```

### Step 3: Run migrations

```bash
# Install Node.js and dependencies on the bastion
# Clone the repository
# Run: npm run migrate:up
```

## Option 3: Temporary Public Access (Not Recommended for Production)

**⚠️ WARNING: This temporarily exposes your database to the internet. Only use for initial setup in non-production environments.**

### Step 1: Temporarily make RDS publicly accessible

1. Go to AWS RDS Console
2. Select your database instance
3. Click "Modify"
4. Under "Connectivity", set "Public access" to "Yes"
5. Under "Security group", add a rule to allow your IP on port 5432
6. Click "Continue" and "Apply immediately"

### Step 2: Run migrations locally

```bash
# Set environment variables
export DB_HOST=<your-rds-endpoint>
export DB_PORT=5432
export DB_NAME=scorebase
export DB_USER=scorebase_admin
export DB_PASSWORD=<get-from-secrets-manager>

# Run migrations
npm run migrate:up
```

### Step 3: Remove public access

1. Go back to RDS Console
2. Modify the database
3. Set "Public access" back to "No"
4. Remove the security group rule

## Verification

After running migrations, test the API:

```bash
# Get a JWT token
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id <your-client-id> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser,PASSWORD=<password> \
  --region us-east-1 \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# Test the API
curl -X GET \
  "https://<your-api-endpoint>/v1/leagues" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

You should see an empty leagues array instead of an error:

```json
{
  "request_id": "...",
  "timestamp": "...",
  "data": {
    "leagues": []
  }
}
```

## Troubleshooting

### "relation does not exist" error
- Migrations haven't run yet. Follow the steps above.

### "no pg_hba.conf entry" error
- SSL is not configured. This should be fixed in the latest deployment.

### "connection timeout" error
- Check VPC security groups
- Verify NAT Gateway is working
- Check Lambda has correct VPC configuration

### "authentication failed" error
- Verify database credentials in Secrets Manager
- Check the DB_SECRET_ARN environment variable in Lambda
