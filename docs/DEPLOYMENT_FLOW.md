# ScoreBase Backend Deployment Flow

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR LOCAL MACHINE                          │
│                                                                 │
│  ┌──────────────┐                                              │
│  │ Backend Code │  (TypeScript, AWS CDK, Tests)                │
│  └──────┬───────┘                                              │
│         │                                                       │
│         │ npm run deploy:staging                               │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │   AWS CDK    │  (Infrastructure as Code)                    │
│  └──────┬───────┘                                              │
└─────────┼─────────────────────────────────────────────────────┘
          │
          │ Creates CloudFormation Stack
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              API Gateway (Public)                       │   │
│  │  https://abc123.execute-api.us-east-1.amazonaws.com    │   │
│  │                                                         │   │
│  │  Routes:                                                │   │
│  │  • GET  /v1/leagues                                     │   │
│  │  • GET  /v1/games/{id}                                  │   │
│  │  • POST /v1/games/{id}/events                           │   │
│  │  • GET  /api-docs (Swagger UI)                          │   │
│  └────────────┬───────────────────────────────────────────┘   │
│               │                                                 │
│               │ Invokes                                         │
│               ▼                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │         Lambda Function (Private VPC)                   │   │
│  │                                                         │   │
│  │  • API Handler (routes requests)                        │   │
│  │  • Services (business logic)                            │   │
│  │  • Repositories (data access)                           │   │
│  │  • Middleware (auth, validation)                        │   │
│  └────┬──────────────────────────┬────────────────────────┘   │
│       │                          │                             │
│       │ Reads/Writes             │ Reads/Writes                │
│       ▼                          ▼                             │
│  ┌─────────────────┐      ┌──────────────────┐               │
│  │  RDS PostgreSQL │      │    DynamoDB      │               │
│  │   (Private)     │      │  (Event Store)   │               │
│  │                 │      │                  │               │
│  │  • Leagues      │      │  • Game Events   │               │
│  │  • Seasons      │      │  • Event History │               │
│  │  • Teams        │      │  • TTL (90 days) │               │
│  │  • Players      │      │                  │               │
│  │  • Games        │      │                  │               │
│  │  • Standings    │      │                  │               │
│  └─────────────────┘      └──────────────────┘               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Cognito User Pool                          │   │
│  │                                                         │   │
│  │  • User authentication                                  │   │
│  │  • JWT token generation                                 │   │
│  │  • Custom attribute: tenant_id                          │   │
│  │  • User groups: scorekeeper, admin                      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                 CloudWatch                              │   │
│  │                                                         │   │
│  │  • Logs (structured JSON)                               │   │
│  │  • Metrics (custom + AWS)                               │   │
│  │  • Alarms (errors, latency, connections)                │   │
│  │  • Dashboards (cost, performance)                       │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              S3 Bucket (Private)                        │   │
│  │                                                         │   │
│  │  • Event archives                                       │   │
│  │  • Lifecycle: Glacier after 365 days                    │   │
│  │  • Versioning enabled                                   │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          │ API Calls
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      iOS APP (iPhone)                           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              ScoreBase iOS App                          │   │
│  │                                                         │   │
│  │  1. User signs in with Cognito                          │   │
│  │  2. Gets JWT token with tenant_id                       │   │
│  │  3. Makes API calls with Bearer token                   │   │
│  │  4. Receives data (leagues, games, standings)           │   │
│  │  5. Creates events (GOAL_SCORED, etc.)                  │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### Step 1: Local Development
```
┌─────────────────┐
│  Write Code     │
│  • TypeScript   │
│  • Tests        │
│  • CDK Stack    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Run Tests      │
│  npm test       │
│  445 tests ✓    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build          │
│  npm run build  │
│  TypeScript→JS  │
└────────┬────────┘
         │
         ▼
```

### Step 2: AWS Deployment
```
┌─────────────────┐
│  CDK Synth      │
│  Generate       │
│  CloudFormation │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  CDK Deploy     │
│  Upload to AWS  │
│  Create Stack   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  AWS Creates Infrastructure         │
│  • VPC (2 AZs, NAT Gateway)         │
│  • RDS (15-20 min)                  │
│  • DynamoDB (instant)               │
│  • Lambda (instant)                 │
│  • API Gateway (instant)            │
│  • Cognito (instant)                │
│  • CloudWatch (instant)             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Get Outputs    │
│  • API URL      │
│  • User Pool ID │
│  • Client ID    │
└────────┬────────┘
         │
         ▼
```

### Step 3: Database Setup
```
┌─────────────────┐
│  Run Migrations │
│  npm run        │
│  migrate:up     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Tables  │
│  • Leagues      │
│  • Seasons      │
│  • Teams        │
│  • Players      │
│  • Games        │
│  • Standings    │
└────────┬────────┘
         │
         ▼
```

### Step 4: User Setup
```
┌─────────────────┐
│  Create User    │
│  in Cognito     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Set Password   │
│  Add to Groups  │
└────────┬────────┘
         │
         ▼
```

### Step 5: iOS Integration
```
┌─────────────────┐
│  Update iOS     │
│  Config         │
│  • Base URL     │
│  • Cognito IDs  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Test Auth      │
│  Sign In        │
│  Get JWT Token  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Make API Calls │
│  Fetch Data     │
│  Create Events  │
└─────────────────┘
```

## Request Flow

### Example: Fetch Leagues

```
┌──────────┐
│ iOS App  │
└────┬─────┘
     │
     │ 1. Sign in with Cognito
     ▼
┌──────────────┐
│   Cognito    │
└────┬─────────┘
     │
     │ 2. Returns JWT token
     │    (includes tenant_id)
     ▼
┌──────────┐
│ iOS App  │
└────┬─────┘
     │
     │ 3. GET /v1/leagues
     │    Authorization: Bearer <JWT>
     ▼
┌──────────────┐
│ API Gateway  │
└────┬─────────┘
     │
     │ 4. Validates JWT with Cognito
     │ 5. Invokes Lambda
     ▼
┌──────────────┐
│   Lambda     │
└────┬─────────┘
     │
     │ 6. Extracts tenant_id from JWT
     │ 7. Queries database
     │    WHERE tenant_id = <from-jwt>
     ▼
┌──────────────┐
│     RDS      │
└────┬─────────┘
     │
     │ 8. Returns leagues
     ▼
┌──────────────┐
│   Lambda     │
└────┬─────────┘
     │
     │ 9. Formats response
     │    {
     │      request_id: "...",
     │      timestamp: "...",
     │      data: [...]
     │    }
     ▼
┌──────────────┐
│ API Gateway  │
└────┬─────────┘
     │
     │ 10. Returns to iOS
     ▼
┌──────────┐
│ iOS App  │
│ Displays │
│ Leagues  │
└──────────┘
```

## Cost Breakdown

### Monthly Costs (Staging)

```
┌─────────────────────────────────────────┐
│ Service          │ Cost      │ % Total  │
├─────────────────────────────────────────┤
│ RDS (db.t3.med)  │ $50-70    │ 70%      │
│ Lambda           │ $5-10     │ 10%      │
│ DynamoDB         │ $1-5      │ 5%       │
│ API Gateway      │ $3-5      │ 5%       │
│ CloudWatch       │ $2-3      │ 3%       │
│ S3               │ $1-2      │ 2%       │
│ Cognito          │ $1-2      │ 2%       │
│ VPC/NAT          │ $2-3      │ 3%       │
├─────────────────────────────────────────┤
│ TOTAL            │ $65-100   │ 100%     │
└─────────────────────────────────────────┘
```

### Cost Optimization Tips

1. **Use smaller RDS for dev**: db.t3.micro (~$15/month)
2. **Stop RDS when not in use**: Save 100% of RDS cost
3. **Use on-demand DynamoDB**: Pay only for what you use
4. **Enable S3 lifecycle**: Auto-archive to Glacier (already configured)
5. **Use Lambda provisioned concurrency only in prod**: Save ~$30/month in staging

## Monitoring

### CloudWatch Dashboards

```
┌─────────────────────────────────────────────────────┐
│              ScoreBase API Dashboard                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Lambda Invocations    │  API Gateway Requests     │
│  ▁▂▃▅▇█▇▅▃▂▁          │  ▁▂▃▅▇█▇▅▃▂▁             │
│  1,234 requests        │  1,234 requests           │
│                                                     │
│  Lambda Errors         │  API Latency (p95)        │
│  ▁▁▁▁▁▁▁▁▁▁▁          │  ▁▂▃▅▇█▇▅▃▂▁             │
│  0 errors ✓            │  145ms ✓                  │
│                                                     │
│  RDS Connections       │  DynamoDB Capacity        │
│  ▁▂▃▅▇█▇▅▃▂▁          │  ▁▂▃▅▇█▇▅▃▂▁             │
│  12 connections        │  5 RCU, 3 WCU             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Alarms

```
┌─────────────────────────────────────────┐
│ Alarm                │ Status │ Action  │
├─────────────────────────────────────────┤
│ Lambda Errors > 10   │ OK ✓   │ Email   │
│ Lambda Duration > 3s │ OK ✓   │ Email   │
│ RDS Connections > 80 │ OK ✓   │ Email   │
│ API 5xx Errors > 10  │ OK ✓   │ Email   │
└─────────────────────────────────────────┘
```

## Summary

**What you deploy:**
- Backend code (TypeScript → JavaScript)
- Infrastructure (AWS CDK → CloudFormation)
- Database schema (migrations)

**What AWS creates:**
- 10+ AWS services
- Fully managed infrastructure
- Auto-scaling and high availability
- Monitoring and logging

**What your iOS app gets:**
- REST API endpoint URL
- Cognito authentication
- Real-time data access
- Event sourcing capabilities

**Time to deploy:**
- First time: ~20 minutes
- Subsequent: ~5 minutes

**Cost:**
- Staging: ~$65-100/month
- Production: ~$200-300/month

Ready to deploy? Follow the [Quick Start Guide](./QUICKSTART.md)!
