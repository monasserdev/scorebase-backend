# Backend Engineering Standards

This steering document ensures consistency across the ScoreBase backend implementation.

## Technology Stack

- **Runtime**: Node.js 20.x LTS
- **Language**: TypeScript 5.x
- **Framework**: AWS Lambda with API Gateway
- **Databases**: 
  - RDS PostgreSQL 15+ (operational data)
  - DynamoDB (event store)
- **Authentication**: Amazon Cognito with JWT
- **Storage**: S3 (event archival)

## Architecture Principles

1. **Event-Driven**: All game mutations produce immutable events
2. **Multi-Tenant**: Strict isolation at every layer via tenant_id
3. **Modular Monolith**: Single Lambda with domain-separated modules
4. **Sport-Agnostic**: Support multiple sports through configuration
5. **Contract-First**: API contracts defined before implementation

## Code Organization

```
src/
├── handlers/          # Lambda entry points
├── services/          # Business logic (domain services)
├── repositories/      # Data access layer
├── models/            # TypeScript interfaces and types
├── middleware/        # Auth, validation, error handling
├── utils/             # Shared utilities
└── config/            # Configuration management
```

## Naming Conventions

- **Files**: kebab-case (e.g., `league-service.ts`)
- **Classes**: PascalCase (e.g., `LeagueService`)
- **Functions**: camelCase (e.g., `getLeagueById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_LEAGUES_PER_TENANT`)
- **Interfaces**: PascalCase with 'I' prefix optional (e.g., `League` or `ILeague`)

## API Response Format

All API responses must follow this envelope:

```typescript
{
  request_id: string      // UUID for request tracing
  timestamp: string       // ISO-8601 timestamp
  data: T                 // Response payload
  meta?: {                // Optional metadata
    pagination?: {
      page: number
      limit: number
      total: number
    }
  }
}
```

## Error Response Format

```typescript
{
  error: {
    code: string          // Machine-readable error code
    message: string       // Human-readable message
    request_id: string    // Request correlation ID
    details?: any         // Optional additional context
  }
}
```

## Multi-Tenant Enforcement

Every database query MUST include tenant_id filtering:

```typescript
// ✅ CORRECT
const leagues = await db.query(
  'SELECT * FROM leagues WHERE tenant_id = $1',
  [tenantId]
)

// ❌ FORBIDDEN
const leagues = await db.query('SELECT * FROM leagues')
```

## Event Schema Requirements

All events must include:

```typescript
interface GameEvent {
  event_id: string           // UUID
  game_id: string            // Game identifier
  tenant_id: string          // Tenant identifier
  event_type: EventType      // Enum of event types
  event_version: string      // Schema version (e.g., "1.0")
  occurred_at: string        // ISO-8601 timestamp
  payload: EventPayload      // Event-specific data
  metadata: EventMetadata    // User, source, IP
  ttl: number                // Unix timestamp for archival
}
```

## Testing Requirements

- **Unit Tests**: All service methods must have unit tests
- **Integration Tests**: API endpoints must have integration tests
- **Property Tests**: Critical algorithms (standings calculation) must have property-based tests
- **Coverage Target**: Minimum 80% code coverage

## Security Requirements

- All endpoints require JWT authentication
- Extract tenant_id from JWT claims, never from request body
- Validate all input using schema validation (Zod or similar)
- Never log sensitive data (passwords, tokens, PII)
- Use parameterized queries to prevent SQL injection

## Performance Guidelines

- API latency target: < 200ms (p95)
- Event write latency: < 50ms (p95)
- Standings recalculation: < 100ms
- Use connection pooling for RDS
- Implement caching where appropriate (Redis future consideration)

## Logging Standards

Every request must log:
- `request_id`
- `tenant_id`
- `user_id`
- `method` and `path`
- `status_code`
- `latency_ms`

Use structured JSON logging:

```typescript
logger.info('Request completed', {
  request_id: requestId,
  tenant_id: tenantId,
  method: 'GET',
  path: '/v1/leagues',
  status_code: 200,
  latency_ms: 45
})
```

## Database Migrations

- Use migration tool (e.g., node-pg-migrate, Knex)
- Never modify production database manually
- All schema changes must be reversible
- Test migrations on staging before production

## Deployment

- Use Infrastructure as Code (AWS CDK or Terraform)
- Environment variables for configuration
- No secrets in source control
- Separate environments: dev, staging, production

## Anti-Patterns (Forbidden)

❌ Business logic in Lambda handlers
❌ Cross-tenant queries without explicit authorization
❌ Hardcoded tenant IDs or configuration
❌ Mutable event history
❌ Breaking API changes without versioning
❌ Direct database access from handlers
❌ Synchronous calls between services (future microservices)
