# JWT Validation Middleware

This middleware validates JWT tokens from Amazon Cognito and extracts user context for multi-tenant isolation.

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
