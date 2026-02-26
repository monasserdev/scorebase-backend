# ScoreBase Backend API

Multi-tenant, event-driven REST API for sports league management built on AWS serverless infrastructure.

## Overview

The ScoreBase Backend API provides real-time game scores, team standings, schedules, and player statistics across multiple sports leagues. Built using TypeScript/Node.js with AWS Lambda, API Gateway, RDS PostgreSQL, DynamoDB, and Cognito.

## Architecture

- **Runtime**: Node.js 20.x LTS
- **Language**: TypeScript 5.x
- **Compute**: AWS Lambda (modular monolith)
- **API**: API Gateway with Cognito JWT authorization
- **Databases**: 
  - RDS PostgreSQL 15+ (operational data)
  - DynamoDB (event store with TTL)
- **Authentication**: Amazon Cognito User Pools
- **Storage**: S3 (event archival)
- **Infrastructure**: AWS CDK

## Key Features

- Multi-tenant data isolation with strict tenant_id enforcement
- Event sourcing for game state with immutable audit trail
- Automatic standings calculation on game finalization
- Sport-agnostic design (basketball, soccer, hockey, baseball, football)
- RESTful API with versioned endpoints (/v1/*)
- Comprehensive monitoring and CloudWatch alarms

## Project Structure

```
.
├── bin/                    # CDK app entry point
├── lib/                    # CDK infrastructure stacks
├── src/
│   ├── handlers/          # Lambda entry points
│   ├── services/          # Business logic (domain services)
│   ├── repositories/      # Data access layer
│   ├── models/            # TypeScript interfaces and types
│   ├── middleware/        # Auth, validation, error handling
│   ├── utils/             # Shared utilities
│   └── config/            # Configuration management
├── test/                  # Unit and integration tests
├── cdk.json               # CDK configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Prerequisites

- Node.js 20.x or higher
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

## Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Development

```bash
# Watch mode for TypeScript compilation
npm run watch

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

## AWS CDK Commands

```bash
# Synthesize CloudFormation template
npm run cdk:synth

# Show differences between deployed stack and current state
npm run cdk:diff

# Deploy stack to AWS
npm run cdk:deploy

# Destroy stack (use with caution)
npm run cdk:destroy
```

## Environment Variables

The following environment variables are used by the Lambda function:

- `DB_HOST` - RDS PostgreSQL host
- `DB_PORT` - RDS PostgreSQL port (default: 5432)
- `DB_NAME` - Database name
- `DB_SECRET_ARN` - ARN of Secrets Manager secret containing DB credentials
- `DYNAMODB_TABLE_NAME` - DynamoDB event store table name
- `S3_ARCHIVE_BUCKET` - S3 bucket for event archives
- `COGNITO_USER_POOL_ID` - Cognito User Pool ID
- `LOG_LEVEL` - Logging level (default: info)

## API Endpoints

### Authentication
All endpoints require JWT Bearer token in Authorization header.

### Leagues
- `GET /v1/leagues` - List all leagues for tenant
- `GET /v1/leagues/{leagueId}` - Get league details
- `GET /v1/leagues/{leagueId}/seasons` - List seasons for league
- `GET /v1/leagues/{leagueId}/teams` - List teams for league

### Seasons
- `GET /v1/seasons/{seasonId}` - Get season details
- `GET /v1/seasons/{seasonId}/games` - List games for season
- `GET /v1/seasons/{seasonId}/standings` - Get standings for season

### Teams
- `GET /v1/teams/{teamId}` - Get team details
- `GET /v1/teams/{teamId}/players` - List players for team

### Players
- `GET /v1/players/{playerId}` - Get player details

### Games
- `GET /v1/games/{gameId}` - Get game details
- `GET /v1/games/{gameId}/events` - List events for game
- `POST /v1/games/{gameId}/events` - Create game event (scorekeeper role required)

## Response Format

All successful responses follow this envelope:

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": { ... }
}
```

All error responses follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

Test coverage target: 80% minimum for business logic.

## Security

- All endpoints require JWT authentication via Cognito
- Multi-tenant isolation enforced at database query level
- Parameterized queries prevent SQL injection
- Secrets stored in AWS Secrets Manager
- Encryption at rest for RDS, DynamoDB, and S3
- TLS 1.2+ enforced for all API communication

## Performance Targets

- API latency: < 200ms (p95)
- Event write latency: < 50ms (p95)
- Standings calculation: < 100ms

## Monitoring

CloudWatch alarms configured for:
- Lambda error rate (threshold: 10 errors in 2 periods)
- Lambda duration (threshold: 3000ms in 3 periods)
- RDS connection count (threshold: 80 connections)
- API Gateway 5xx errors

## License

MIT

## Support

For issues and questions, please contact the ScoreBase engineering team.
