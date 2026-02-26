# Utilities

This directory contains shared utility functions used across the ScoreBase backend.

## Response Formatter

The response formatter provides standardized API response formatting utilities.

### Features

- **Consistent Response Format**: All responses follow the same envelope structure
- **Request Tracing**: Every response includes a unique `request_id` (UUID v4)
- **Timestamps**: All responses include ISO-8601 formatted timestamps
- **CORS Support**: Automatic CORS headers on all responses
- **Type Safety**: Full TypeScript support with typed response models

### Usage

#### Success Responses

```typescript
import { successResponse, HttpStatus } from '../utils/response-formatter';

// Simple success response (200 OK)
return successResponse({ leagues: [...] });

// Success with custom status code (201 Created)
return successResponse({ league: newLeague }, HttpStatus.CREATED);

// Success with pagination metadata
return successResponse(
  { leagues: [...] },
  HttpStatus.OK,
  {
    pagination: {
      page: 1,
      limit: 10,
      total: 100
    }
  }
);

// Success with custom request_id (for request correlation)
return successResponse({ data: [...] }, HttpStatus.OK, undefined, requestId);
```

#### Error Responses

```typescript
import {
  errorResponse,
  validationErrorResponse,
  authenticationErrorResponse,
  authorizationErrorResponse,
  notFoundErrorResponse,
  internalErrorResponse,
  serviceUnavailableErrorResponse,
  ErrorCode,
  HttpStatus,
} from '../utils/response-formatter';

// Generic error response
return errorResponse(
  ErrorCode.NOT_FOUND,
  'League not found',
  HttpStatus.NOT_FOUND
);

// Validation error (400)
return validationErrorResponse('Invalid input', {
  field: 'email',
  reason: 'Invalid format'
});

// Authentication error (401)
return authenticationErrorResponse('Invalid token');

// Authorization error (403)
return authorizationErrorResponse('Access denied');

// Not found error (404)
return notFoundErrorResponse('League not found');

// Internal server error (500)
return internalErrorResponse('Database connection failed');

// Service unavailable (503)
return serviceUnavailableErrorResponse('Database maintenance in progress');
```

### Response Format

#### Success Response

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "leagues": [...]
  },
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100
    }
  }
}
```

#### Error Response

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "League not found",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "details": {
      "league_id": "123"
    }
  }
}
```

### CORS Headers

All responses automatically include the following CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

### Error Codes

Standard error codes are defined in `src/models/response.ts`:

- `VALIDATION_ERROR`: Input validation failed (400)
- `AUTHENTICATION_ERROR`: Authentication failed (401)
- `AUTHORIZATION_ERROR`: Authorization failed (403)
- `NOT_FOUND`: Resource not found (404)
- `CONFLICT`: Resource conflict (409)
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded (429)
- `INTERNAL_ERROR`: Internal server error (500)
- `SERVICE_UNAVAILABLE`: Service unavailable (503)

### HTTP Status Codes

Standard HTTP status codes are defined in `src/models/response.ts`:

- `OK = 200`
- `CREATED = 201`
- `BAD_REQUEST = 400`
- `UNAUTHORIZED = 401`
- `FORBIDDEN = 403`
- `NOT_FOUND = 404`
- `CONFLICT = 409`
- `TOO_MANY_REQUESTS = 429`
- `INTERNAL_SERVER_ERROR = 500`
- `SERVICE_UNAVAILABLE = 503`

### Request ID Correlation

The `request_id` field enables request tracing across the system:

1. Generate a request ID at the API Gateway entry point
2. Pass it through all service calls
3. Include it in all responses
4. Log it with all operations
5. Use it for debugging and troubleshooting

Example:

```typescript
// Generate request ID at entry point
const requestId = generateRequestId();

// Pass through service calls
const result = await leagueService.getLeagues(tenantId, requestId);

// Include in response
return successResponse(result, HttpStatus.OK, undefined, requestId);

// Log with request ID
logger.info('Request completed', { request_id: requestId, ... });
```

### Testing

Comprehensive unit tests are available in `test/utils/response-formatter.test.ts`.

Run tests:

```bash
npm test -- test/utils/response-formatter.test.ts
```

### Requirements

This module satisfies the following requirements:

- **8.1**: Standard response envelope with request_id and timestamp
- **8.2**: Error response format with code and message
- **8.3**: UUID generation for request_id
- **8.4**: ISO-8601 timestamp formatting
- **8.9**: CORS headers on all responses
