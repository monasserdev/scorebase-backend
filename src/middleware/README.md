# Middleware

This directory contains middleware for authentication, authorization, and multi-tenant isolation.

## JWT Validation Middleware

Validates JWT tokens from Amazon Cognito and extracts user context for multi-tenant isolation.

## Features

- ✅ Validates JWT token signature using Cognito public keys
- ✅ Caches public keys for performance (1 hour TTL)
- ✅ Handles expired tokens with proper error codes
- ✅ Handles invalid signatures with proper error codes
- ✅ Extracts tenant_id, user_id, and roles from token claims
- ✅ Enforces tenant_id presence for multi-tenant isolation

## Usage

```typescript
import { validateJWT } from './middleware/jwt-validation';
import { AuthContext, AuthError, AuthErrorCode } from './models/auth';

// In your Lambda handler
async function handler(event: APIGatewayProxyEvent) {
  const authHeader = event.headers.Authorization;
  const userPoolId = process.env.USER_POOL_ID!;
  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    const authContext: AuthContext = await validateJWT(
      authHeader,
      userPoolId,
      region
    );

    // Use authContext for multi-tenant queries
    console.log('User ID:', authContext.user_id);
    console.log('Tenant ID:', authContext.tenant_id);
    console.log('Roles:', authContext.roles);

    // Proceed with request handling
    // ...
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.code) {
        case AuthErrorCode.MISSING_TOKEN:
          return {
            statusCode: 401,
            body: JSON.stringify({
              error: {
                code: error.code,
                message: error.message,
              },
            }),
          };
        case AuthErrorCode.EXPIRED_TOKEN:
        case AuthErrorCode.INVALID_SIGNATURE:
        case AuthErrorCode.INVALID_TOKEN:
          return {
            statusCode: 401,
            body: JSON.stringify({
              error: {
                code: error.code,
                message: error.message,
              },
            }),
          };
        case AuthErrorCode.MISSING_TENANT_ID:
          return {
            statusCode: 403,
            body: JSON.stringify({
              error: {
                code: error.code,
                message: error.message,
              },
            }),
          };
      }
    }

    // Unknown error
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      }),
    };
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_TOKEN` | 401 | Authorization header is missing |
| `INVALID_TOKEN` | 401 | Token format is invalid or malformed |
| `EXPIRED_TOKEN` | 401 | Token has expired |
| `INVALID_SIGNATURE` | 401 | Token signature verification failed |
| `MISSING_TENANT_ID` | 403 | Token missing required tenant_id claim |

## Performance

- Public keys are cached for 1 hour to minimize network calls to Cognito
- JWKS client implements rate limiting (10 requests per minute)
- Typical validation time: < 10ms (cached) or < 100ms (first request)

## Requirements

This middleware satisfies the following requirements:
- **1.1**: JWT token validation
- **1.2**: Token expiration handling
- **1.3**: Invalid signature detection
- **1.4**: Tenant ID extraction
- **10.2**: Performance optimization through caching


---

## Multi-Tenant Isolation Middleware

This middleware enforces strict tenant isolation at the database query level, preventing cross-tenant data leakage.

### Features

- ✅ Validates tenant_id is present and valid UUID
- ✅ Ensures all queries include tenant_id filter in WHERE clause
- ✅ Verifies all results belong to requesting tenant (defense in depth)
- ✅ Logs security violations to CloudWatch with HIGH severity
- ✅ Provides convenience wrappers for single/many row queries

### Usage

```typescript
import {
  enforceMultiTenantIsolation,
  enforceMultiTenantIsolationSingle,
  enforceMultiTenantIsolationMany,
  TenantIsolationError,
  TenantIsolationErrorCode,
} from './middleware/multi-tenant-isolation';

// Example 1: Query multiple rows
async function getLeagues(tenantId: string) {
  try {
    const leagues = await enforceMultiTenantIsolationMany(
      tenantId,
      'SELECT * FROM leagues WHERE tenant_id = $1',
      []
    );
    return leagues;
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      console.error('Tenant isolation violation:', error.code, error.message);
      throw error;
    }
    throw error;
  }
}

// Example 2: Query single row
async function getLeagueById(tenantId: string, leagueId: string) {
  const league = await enforceMultiTenantIsolationSingle(
    tenantId,
    'SELECT * FROM leagues WHERE tenant_id = $1 AND league_id = $2',
    [leagueId]
  );
  
  if (!league) {
    throw new Error('League not found');
  }
  
  return league;
}

// Example 3: Complex query with multiple filters
async function getGamesBySeason(
  tenantId: string,
  seasonId: string,
  status?: string
) {
  const query = `
    SELECT * FROM games 
    WHERE tenant_id = $1 
      AND season_id = $2
      ${status ? 'AND status = $3' : ''}
    ORDER BY scheduled_at
  `;
  
  const params = status ? [seasonId, status] : [seasonId];
  
  return enforceMultiTenantIsolationMany(tenantId, query, params);
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TENANT_ID` | tenant_id is missing or not a valid UUID |
| `QUERY_MISSING_TENANT_FILTER` | Query does not include tenant_id in WHERE clause |
| `TENANT_ISOLATION_VIOLATION` | Query returned data belonging to different tenant |

### Security Logging

All security violations are logged to CloudWatch with the following structure:

```typescript
{
  timestamp: "2024-01-15T10:30:00.000Z",
  tenant_id: "550e8400-e29b-41d4-a716-446655440000",
  violation_type: "CROSS_TENANT_DATA_LEAKAGE",
  severity: "HIGH",
  details: {
    expected_tenant_id: "550e8400-e29b-41d4-a716-446655440000",
    actual_tenant_id: "660e8400-e29b-41d4-a716-446655440001",
    query: "SELECT * FROM leagues WHERE...",
    row_count: 2
  }
}
```

### Best Practices

1. **Always use enforceMultiTenantIsolation** for database queries
   - Never use raw `query()` function directly in repositories
   - Extract tenant_id from JWT claims, never from request body

2. **tenant_id must be first parameter** in WHERE clause
   - Query: `WHERE tenant_id = $1 AND league_id = $2`
   - Params: `[leagueId]` (tenant_id is prepended automatically)

3. **Use convenience wrappers** for cleaner code
   - `enforceMultiTenantIsolationSingle()` for single row queries
   - `enforceMultiTenantIsolationMany()` for multiple row queries

4. **Handle errors appropriately**
   - Catch `TenantIsolationError` separately from database errors
   - Return 403 Forbidden for isolation violations
   - Return 500 Internal Server Error for database errors

### Performance

- Minimal overhead: ~1-2ms per query for validation
- No additional database round trips
- Defense-in-depth verification happens in-memory

### Requirements

This middleware satisfies the following requirements:
- **2.1**: All queries include tenant_id in WHERE clause
- **2.2**: All results verified to belong to requesting tenant
- **2.3**: Cross-tenant access attempts return 403 Forbidden
- **2.4**: Security violations logged to CloudWatch
- **2.5**: tenant_id extracted from JWT claims only
