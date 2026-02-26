# ScoreBase Backend

Multi-tenant, event-driven REST API for the ScoreBase platform. Built on AWS serverless infrastructure with TypeScript/Node.js.

## Architecture

- **API Gateway**: REST API entry point with JWT authentication
- **Lambda**: Modular monolith handling all business logic
- **RDS PostgreSQL**: Operational data (leagues, teams, games, standings)
- **DynamoDB**: Event store for game events with event sourcing
- **Cognito**: User authentication and multi-tenant authorization
- **S3**: Long-term event archival

## Getting Started

Documentation and implementation details are being developed in `.kiro/specs/scorebase-backend/`.

## Repository Structure

```
scorebase-backend/
├── .kiro/              # Kiro configuration and specs
├── docs/               # Architecture and design documentation
├── src/                # Source code (to be implemented)
├── tests/              # Test suites (to be implemented)
└── infrastructure/     # IaC templates (to be implemented)
```
