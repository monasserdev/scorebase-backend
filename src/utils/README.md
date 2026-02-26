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

## Event Validation

The event validation module provides JSON schema validation for game event payloads using ajv.

### Features

- **Schema Validation**: Validates event payloads against event_type-specific JSON schemas
- **Field-Specific Errors**: Returns detailed error messages for each invalid field
- **Type Safety**: Full TypeScript support with typed event payloads
- **Format Validation**: Validates UUIDs, ISO-8601 timestamps, and custom patterns
- **Strict Mode**: Rejects additional properties not defined in schemas

### Supported Event Types

- `GAME_STARTED`: Game start event with start_time and optional location
- `GOAL_SCORED`: Goal event with team, player, period, and time information
- `PENALTY_ASSESSED`: Penalty event with team, player, penalty type, and duration
- `PERIOD_ENDED`: Period end event with period number and scores
- `GAME_FINALIZED`: Game finalization event with final scores
- `GAME_CANCELLED`: Game cancellation event with reason and timestamp
- `SCORE_CORRECTED`: Score correction event with team, old/new scores, and reason

### Usage

#### Validate Event Payload

```typescript
import { validateEventPayload } from '../utils/event-validation';
import { EventType } from '../models/event';

// Validate GOAL_SCORED event
const payload = {
  team_id: '123e4567-e89b-12d3-a456-426614174000',
  player_id: '223e4567-e89b-12d3-a456-426614174000',
  assist_player_id: '323e4567-e89b-12d3-a456-426614174000',
  period: 2,
  time_remaining: '08:45'
};

try {
  validateEventPayload(EventType.GOAL_SCORED, payload);
  // Payload is valid, proceed with event creation
} catch (error) {
  if (error instanceof BadRequestError) {
    // error.code === 'INVALID_EVENT_PAYLOAD'
    // error.details contains field-specific errors
    console.error('Validation failed:', error.details);
  }
}
```

#### Check Event Type Validity

```typescript
import { isValidEventType } from '../utils/event-validation';

if (isValidEventType(eventType)) {
  // Event type is valid
  validateEventPayload(eventType, payload);
} else {
  // Unknown event type
  throw new BadRequestError(`Unknown event type: ${eventType}`);
}
```

### Event Schemas

#### GAME_STARTED

```typescript
{
  start_time: string;      // ISO-8601 timestamp (required)
  location?: string;       // Optional location
}
```

#### GOAL_SCORED

```typescript
{
  team_id: string;         // UUID (required)
  player_id: string;       // UUID (required)
  assist_player_id?: string; // UUID (optional)
  period: number;          // >= 1 (required)
  time_remaining: string;  // Format: MM:SS (required)
}
```

#### PENALTY_ASSESSED

```typescript
{
  team_id: string;         // UUID (required)
  player_id: string;       // UUID (required)
  penalty_type: string;    // Non-empty (required)
  duration_minutes: number; // >= 0 (required)
  period: number;          // >= 1 (required)
  time_remaining: string;  // Format: MM:SS (required)
}
```

#### PERIOD_ENDED

```typescript
{
  period: number;          // >= 1 (required)
  home_score: number;      // >= 0 (required)
  away_score: number;      // >= 0 (required)
}
```

#### GAME_FINALIZED

```typescript
{
  final_home_score: number; // >= 0 (required)
  final_away_score: number; // >= 0 (required)
}
```

#### GAME_CANCELLED

```typescript
{
  reason: string;          // Non-empty (required)
  cancelled_at: string;    // ISO-8601 timestamp (required)
}
```

#### SCORE_CORRECTED

```typescript
{
  team_id: string;         // UUID (required)
  old_score: number;       // >= 0 (required)
  new_score: number;       // >= 0 (required)
  reason: string;          // Non-empty (required)
}
```

### Error Response Format

When validation fails, a `BadRequestError` is thrown with the following structure:

```typescript
{
  name: 'BadRequestError',
  message: 'Invalid event payload',
  code: 'INVALID_EVENT_PAYLOAD',
  details: {
    'team_id': 'Invalid format, expected uuid',
    'period': 'Must be >= 1',
    'time_remaining': 'Does not match required pattern'
  }
}
```

### Validation Rules

- **Required Fields**: All required fields must be present
- **Data Types**: Fields must match expected types (string, number, etc.)
- **Format Validation**: UUIDs and timestamps must be valid formats
- **Range Validation**: Numeric fields must meet minimum/maximum constraints
- **Pattern Validation**: String fields must match required patterns (e.g., MM:SS)
- **Additional Properties**: Extra fields not in schema are rejected

### Testing

Comprehensive unit tests are available in `test/utils/event-validation.test.ts`.

Run tests:

```bash
npm test -- test/utils/event-validation.test.ts
```

### Requirements

This module satisfies the following requirements:

- **6.1**: Event payload validation against event_type-specific schemas
- **6.6**: Support for all event types (GAME_STARTED, GOAL_SCORED, etc.)
- **8.6**: Return 400 Bad Request with INVALID_EVENT_PAYLOAD code
- **10.5**: Input validation using JSON schema validation

## Apply Event to Game

The apply event to game module updates game state in RDS based on event type using database transactions.

### Features

- **Transaction Support**: All updates use database transactions for atomicity
- **Multi-Tenant Isolation**: Validates game belongs to tenant before applying changes
- **Event Type Handlers**: Specialized handlers for each event type
- **Error Handling**: Proper error types for not found and validation errors
- **Idempotent Updates**: Safe to retry failed operations

### Supported Event Types

- `GOAL_SCORED`: Increments home or away team score
- `GAME_STARTED`: Sets game status to 'live'
- `GAME_FINALIZED`: Sets status to 'final' and updates final scores
- `GAME_CANCELLED`: Sets game status to 'cancelled'
- `PENALTY_ASSESSED`: No game state changes (event logged only)
- `PERIOD_ENDED`: No game state changes (event logged only)
- `SCORE_CORRECTED`: No game state changes (event logged only)

### Usage

#### Apply Event to Game

```typescript
import { applyEventToGame } from '../utils/apply-event-to-game';
import { GameEvent, EventType } from '../models/event';

// After persisting event to DynamoDB, apply to game state
const event: GameEvent = {
  event_id: 'event-123',
  game_id: 'game-456',
  tenant_id: 'tenant-789',
  event_type: EventType.GOAL_SCORED,
  event_version: '1.0',
  occurred_at: new Date().toISOString(),
  sort_key: `${new Date().toISOString()}#event-123`,
  payload: {
    team_id: 'team-home',
    player_id: 'player-1',
    period: 1,
    time_remaining: '10:00'
  },
  metadata: {
    user_id: 'user-1',
    source: 'mobile-app'
  },
  ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
};

try {
  await applyEventToGame(tenantId, gameId, event);
  // Game state updated successfully
} catch (error) {
  if (error instanceof NotFoundError) {
    // Game not found or doesn't belong to tenant
  } else if (error instanceof BadRequestError) {
    // Invalid event data (e.g., team not part of game)
  }
}
```

### Event Handlers

#### GOAL_SCORED Handler

Increments the appropriate team's score:

```sql
-- If home team scored
UPDATE games
SET home_score = home_score + 1,
    updated_at = NOW()
WHERE id = $1

-- If away team scored
UPDATE games
SET away_score = away_score + 1,
    updated_at = NOW()
WHERE id = $1
```

Validates that the team_id in the event payload matches either home_team_id or away_team_id.

#### GAME_STARTED Handler

Sets game status to 'live':

```sql
UPDATE games
SET status = 'live',
    updated_at = NOW()
WHERE id = $1
```

#### GAME_FINALIZED Handler

Sets status to 'final' and updates final scores:

```sql
UPDATE games
SET status = 'final',
    home_score = $1,
    away_score = $2,
    updated_at = NOW()
WHERE id = $3
```

Uses final_home_score and final_away_score from event payload.

#### GAME_CANCELLED Handler

Sets game status to 'cancelled':

```sql
UPDATE games
SET status = 'cancelled',
    updated_at = NOW()
WHERE id = $1
```

### Transaction Flow

1. **Begin Transaction**: Start database transaction
2. **Verify Game**: Check game exists and belongs to tenant
3. **Apply Event**: Execute event-specific update
4. **Commit**: Commit transaction if successful
5. **Rollback**: Rollback on any error

```typescript
await transaction(async (client: PoolClient) => {
  // Verify game exists and belongs to tenant
  const gameCheck = await client.query(
    `SELECT g.id, g.status, g.home_team_id, g.away_team_id
     FROM games g
     INNER JOIN seasons s ON g.season_id = s.id
     INNER JOIN leagues l ON s.league_id = l.id
     WHERE l.tenant_id = $1 AND g.id = $2`,
    [tenantId, gameId]
  );

  if (gameCheck.rows.length === 0) {
    throw new NotFoundError(`Game not found: ${gameId}`);
  }

  // Apply event-specific update
  // ...
});
```

### Error Handling

#### NotFoundError (404)

Thrown when:
- Game does not exist
- Game does not belong to tenant (multi-tenant isolation)

```typescript
throw new NotFoundError(`Game not found: ${gameId}`);
```

#### BadRequestError (400)

Thrown when:
- Team in GOAL_SCORED event is not part of the game

```typescript
throw new BadRequestError(`Team ${team_id} is not part of game ${gameId}`);
```

### Multi-Tenant Isolation

All game lookups enforce tenant isolation by joining through seasons and leagues:

```sql
SELECT g.*
FROM games g
INNER JOIN seasons s ON g.season_id = s.id
INNER JOIN leagues l ON s.league_id = l.id
WHERE l.tenant_id = $1 AND g.id = $2
```

This ensures:
- Games can only be updated by their owning tenant
- Cross-tenant access attempts fail with NotFoundError
- No direct tenant_id column needed on games table

### Testing

Comprehensive unit tests are available in `test/utils/apply-event-to-game.test.ts`.

Run tests:

```bash
npm test -- test/utils/apply-event-to-game.test.ts
```

Test coverage includes:
- GOAL_SCORED for home and away teams
- GAME_STARTED status update
- GAME_FINALIZED with final scores
- GAME_CANCELLED status update
- PENALTY_ASSESSED (no state change)
- PERIOD_ENDED (no state change)
- Game not found error
- Team not part of game error
- Multi-tenant isolation

### Requirements

This module satisfies the following requirements:

- **6.7**: GOAL_SCORED events increment appropriate team score
- **6.8**: GAME_FINALIZED events set status to 'final'
- **6.8**: GAME_STARTED events set status to 'live'
- **6.8**: GAME_CANCELLED events set status to 'cancelled'
- **9.4**: Use database transactions for atomic updates
- **2.1**: Enforce multi-tenant isolation on all queries

### Integration

This function is called by EventService after persisting events to DynamoDB:

```typescript
// In EventService.createEvent()
// 1. Validate event payload
validateEventPayload(event_type, payload);

// 2. Persist event to DynamoDB
await dynamoClient.writeEvent(event);

// 3. Apply event to game state in RDS
await applyEventToGame(tenantId, gameId, event);

// 4. Trigger standings recalculation if needed
if (event_type === EventType.GAME_FINALIZED) {
  await recalculateStandings(tenantId, seasonId);
}
```
