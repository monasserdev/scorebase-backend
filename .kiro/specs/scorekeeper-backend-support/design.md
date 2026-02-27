# Design Document: ScoreKeeper Backend Support

## Overview

This design document specifies the backend enhancements required to support the ScoreKeeper iOS application, a spatial hockey event capture tool for venue scorekeepers. The implementation extends the existing ScoreBase backend with real-time WebSocket synchronization, game snapshot generation, offline event support, and spatial coordinate validation.

### Goals

- Enable real-time synchronization between multiple ScoreKeeper devices using WebSocket connections
- Provide game snapshot responses after event creation for optimistic UI reconciliation
- Support offline event capture with client-provided timestamps
- Validate and persist spatial coordinates for future analytics
- Implement event reversal mechanism for correcting mistakes
- Maintain sub-200ms response times for event creation
- Ensure multi-tenant isolation across all new features

### Non-Goals

- Implementing the ScoreKeeper iOS application (separate project)
- Building analytics or heat map visualization features (future work)
- Supporting sports other than hockey in this phase (architecture remains sport-agnostic)
- Implementing video replay or media upload features
- Creating a web-based scorekeeper interface

### Success Criteria

- WebSocket connections successfully broadcast game snapshots to all connected clients within 50ms
- Event creation API returns complete game snapshots within 200ms at p95
- Spatial coordinates are validated and persisted with 4 decimal place precision
- Event reversals correctly undo previous events and update game state
- Multi-tenant isolation is maintained across WebSocket connections
- Idempotent event creation prevents duplicate events from network retries

## Architecture

### High-Level Architecture

The ScoreKeeper backend support builds on the existing event-driven architecture with three major additions:

1. **WebSocket API Gateway**: New AWS API Gateway WebSocket API for bidirectional real-time communication
2. **Snapshot Service**: New service layer component for generating game snapshots from current state
3. **Broadcast Service**: New service layer component for distributing snapshots to WebSocket connections

```mermaid
graph TB
    subgraph "Client Layer"
        SK[ScoreKeeper iOS App]
    end
    
    subgraph "API Gateway Layer"
        REST[REST API Gateway<br/>Existing]
        WS[WebSocket API Gateway<br/>NEW]
    end
    
    subgraph "Lambda Layer"
        API[API Handler Lambda<br/>Enhanced]
        WSH[WebSocket Handler Lambda<br/>NEW]
    end
    
    subgraph "Service Layer"
        ES[Event Service<br/>Enhanced]
        SS[Snapshot Service<br/>NEW]
        BS[Broadcast Service<br/>NEW]
        GS[Game Service<br/>Existing]
    end
    
    subgraph "Data Layer"
        DDB[(DynamoDB<br/>Event Store)]
        RDS[(RDS PostgreSQL<br/>Game State)]
        CONN[Connection Store<br/>DynamoDB]
    end
    
    SK -->|POST /games/{id}/events| REST
    SK -->|GET /games/{id}/snapshot| REST
    SK <-->|wss://.../{id}/stream| WS
    
    REST --> API
    WS --> WSH
    
    API --> ES
    API --> SS
    ES --> SS
    ES --> BS
    
    WSH --> SS
    WSH --> BS
    
    ES --> DDB
    ES --> RDS
    SS --> RDS
    SS --> DDB
    BS --> CONN
    BS --> WS
    
    GS --> RDS
```

### Architecture Decisions

**Decision 1: WebSocket API Gateway vs. Custom WebSocket Server**
- **Choice**: Use AWS API Gateway WebSocket API
- **Rationale**: Leverages existing AWS infrastructure, provides automatic scaling, integrates with Cognito authentication, and eliminates need for managing WebSocket server infrastructure
- **Trade-offs**: Slightly higher latency than custom server, but significantly lower operational complexity

**Decision 2: Connection State Storage**
- **Choice**: Store WebSocket connection metadata in DynamoDB
- **Rationale**: DynamoDB provides fast lookups for connection routing, integrates with existing event store, and supports TTL for automatic cleanup of stale connections
- **Trade-offs**: Additional DynamoDB table required, but provides reliable connection tracking across Lambda invocations

**Decision 3: Snapshot Generation Strategy**
- **Choice**: Generate snapshots on-demand from RDS + recent events from DynamoDB
- **Rationale**: Ensures snapshots always reflect current authoritative state, avoids snapshot staleness issues, and reuses existing data access patterns
- **Trade-offs**: Requires two data source queries, but meets 200ms performance target with proper indexing

**Decision 4: Event Reversal Implementation**
- **Choice**: Store reversal as new immutable event, apply reverse logic in game state
- **Rationale**: Maintains immutable event history, provides audit trail of all actions, and aligns with event-sourcing principles
- **Trade-offs**: Requires reverse logic for each event type, but provides complete history and supports future event replay

**Decision 5: Spatial Coordinate Storage**
- **Choice**: Store coordinates in DynamoDB event payload as nested JSON
- **Rationale**: Keeps all event data together, supports flexible schema evolution, and enables future querying via DynamoDB expressions
- **Trade-offs**: No native spatial indexing, but sufficient for current requirements (analytics will use separate data pipeline)

## Components and Interfaces

### New Components

#### SnapshotService

Responsible for generating game snapshots from current game state and recent events.

```typescript
interface SnapshotService {
  /**
   * Generate a complete game snapshot
   * @param tenantId - Tenant identifier for multi-tenant isolation
   * @param gameId - Game identifier
   * @returns Complete game snapshot with scores, period, clock, status, and recent events
   * @throws NotFoundError if game doesn't exist
   * @throws ForbiddenError if game doesn't belong to tenant
   */
  generateSnapshot(tenantId: string, gameId: string): Promise<GameSnapshot>;
  
  /**
   * Generate snapshot after event creation (optimized path)
   * @param tenantId - Tenant identifier
   * @param gameId - Game identifier
   * @param updatedGame - Already-updated game state from event processing
   * @returns Game snapshot using provided game state
   */
  generateSnapshotFromGame(
    tenantId: string,
    gameId: string,
    updatedGame: Game
  ): Promise<GameSnapshot>;
}
```

**Implementation Notes**:
- Uses GameRepository to fetch current game state from RDS
- Uses EventRepository to fetch 10 most recent events from DynamoDB
- Caches game state within single request to avoid duplicate queries
- Implements performance monitoring to ensure <200ms target

#### BroadcastService

Responsible for distributing game snapshots to connected WebSocket clients.

```typescript
interface BroadcastService {
  /**
   * Broadcast game snapshot to all connected clients for a game
   * @param tenantId - Tenant identifier for filtering connections
   * @param gameId - Game identifier
   * @param snapshot - Game snapshot to broadcast
   * @param messageType - Type of message (initial_snapshot or snapshot_update)
   */
  broadcastSnapshot(
    tenantId: string,
    gameId: string,
    snapshot: GameSnapshot,
    messageType: 'initial_snapshot' | 'snapshot_update'
  ): Promise<void>;
  
  /**
   * Send snapshot to a specific connection
   * @param connectionId - WebSocket connection identifier
   * @param snapshot - Game snapshot to send
   * @param messageType - Type of message
   */
  sendSnapshotToConnection(
    connectionId: string,
    snapshot: GameSnapshot,
    messageType: 'initial_snapshot' | 'snapshot_update'
  ): Promise<void>;
}
```

**Implementation Notes**:
- Uses ConnectionRepository to query active connections for game
- Filters connections by tenant_id for multi-tenant isolation
- Uses API Gateway Management API to post messages to connections
- Handles failed connections by removing them from connection store
- Implements batch sending for efficiency with many connections

#### WebSocketHandler

Lambda handler for WebSocket lifecycle events (connect, disconnect, message).

```typescript
interface WebSocketHandler {
  /**
   * Handle WebSocket connection establishment
   * @param event - API Gateway WebSocket connect event
   * @returns Response with statusCode 200 (accept) or 401/403 (reject)
   */
  handleConnect(event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult>;
  
  /**
   * Handle WebSocket disconnection
   * @param event - API Gateway WebSocket disconnect event
   * @returns Response with statusCode 200
   */
  handleDisconnect(event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult>;
  
  /**
   * Handle incoming WebSocket messages (ping/pong)
   * @param event - API Gateway WebSocket message event
   * @returns Response with statusCode 200
   */
  handleMessage(event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult>;
}
```

**Implementation Notes**:
- Validates JWT token from query string parameter on connect
- Extracts tenant_id and user_id from JWT claims
- Validates game_id exists and belongs to tenant
- Stores connection metadata in DynamoDB with TTL
- Sends initial snapshot on successful connection
- Removes connection from store on disconnect

### Enhanced Components

#### EventService (Enhanced)

Extended to support spatial coordinates, event reversal, offline timestamps, and idempotency.

```typescript
interface EventService {
  // Existing methods...
  
  /**
   * Create a game event with enhanced features
   * @param tenantId - Tenant identifier
   * @param gameId - Game identifier
   * @param eventType - Type of event
   * @param payload - Event payload (may include spatial coordinates)
   * @param metadata - Event metadata
   * @param options - Optional parameters (occurred_at, idempotency_key)
   * @returns Created event and game snapshot
   */
  createEventWithSnapshot(
    tenantId: string,
    gameId: string,
    eventType: EventType,
    payload: EventPayload,
    metadata: EventMetadata,
    options?: {
      occurred_at?: string;
      idempotency_key?: string;
    }
  ): Promise<{ event: GameEvent; snapshot: GameSnapshot }>;
  
  /**
   * Reverse a previously created event
   * @param tenantId - Tenant identifier
   * @param gameId - Game identifier
   * @param reversedEventId - ID of event to reverse
   * @param metadata - Event metadata
   * @returns Reversal event and updated game snapshot
   */
  reverseEvent(
    tenantId: string,
    gameId: string,
    reversedEventId: string,
    metadata: EventMetadata
  ): Promise<{ event: GameEvent; snapshot: GameSnapshot }>;
}
```

**Enhancement Notes**:
- Validates spatial coordinates if present in payload
- Checks idempotency_key before creating event
- Preserves client-provided occurred_at timestamp
- Generates snapshot after event creation
- Triggers broadcast to WebSocket connections
- Implements reversal logic for GOAL_SCORED, PENALTY_ASSESSED, SHOT_ON_GOAL

### New Repositories

#### ConnectionRepository

Manages WebSocket connection metadata in DynamoDB.

```typescript
interface ConnectionRepository {
  /**
   * Store connection metadata
   * @param connection - Connection metadata
   */
  storeConnection(connection: WebSocketConnection): Promise<void>;
  
  /**
   * Remove connection metadata
   * @param connectionId - Connection identifier
   */
  removeConnection(connectionId: string): Promise<void>;
  
  /**
   * Get all active connections for a game
   * @param gameId - Game identifier
   * @param tenantId - Tenant identifier for filtering
   * @returns Array of active connections
   */
  getConnectionsByGame(gameId: string, tenantId: string): Promise<WebSocketConnection[]>;
  
  /**
   * Get connection by ID
   * @param connectionId - Connection identifier
   * @returns Connection metadata or null
   */
  getConnection(connectionId: string): Promise<WebSocketConnection | null>;
}
```

#### EventRepository (Enhanced)

Extended to support idempotency key queries and reversal tracking.

```typescript
interface EventRepository {
  // Existing methods...
  
  /**
   * Find event by idempotency key
   * @param tenantId - Tenant identifier
   * @param idempotencyKey - Idempotency key
   * @returns Event if found, null otherwise
   */
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<GameEvent | null>;
  
  /**
   * Check if event has been reversed
   * @param tenantId - Tenant identifier
   * @param eventId - Event identifier
   * @returns True if event has been reversed
   */
  isEventReversed(tenantId: string, eventId: string): Promise<boolean>;
}
```

## Data Models

### GameSnapshot

Complete representation of current game state for client synchronization.

```typescript
interface GameSnapshot {
  game_id: string;
  home_score: number;
  away_score: number;
  period: number;
  clock_seconds: number;
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed';
  recent_events: GameEvent[];  // 10 most recent, ordered by occurred_at desc
  snapshot_version: string;     // Schema version (e.g., "1.0")
  generated_at: string;         // ISO-8601 timestamp
}
```

### SpatialCoordinates

Normalized coordinates for event location on playing surface.

```typescript
interface SpatialCoordinates {
  x: number;        // 0.0 to 1.0, left to right
  y: number;        // 0.0 to 1.0, top to bottom
  zone?: string;    // Optional zone identifier (e.g., "offensive", "defensive", "neutral")
}
```

**Validation Rules**:
- x must be >= 0.0 and <= 1.0
- y must be >= 0.0 and <= 1.0
- zone is optional string field
- Stored with 4 decimal place precision

### EventPayload (Enhanced)

Extended event payloads to include optional spatial coordinates.

```typescript
// Example: GOAL_SCORED with spatial coordinates
interface GoalScoredPayload {
  team_id: string;
  player_id: string;
  assist_player_id?: string;
  period: number;
  time_remaining: string;
  spatial_coordinates?: SpatialCoordinates;  // NEW
}

// Example: SHOT_ON_GOAL with spatial coordinates
interface ShotOnGoalPayload {
  team_id: string;
  player_id: string;
  period: number;
  time_remaining: string;
  spatial_coordinates?: SpatialCoordinates;  // NEW
}
```

### EventReversalPayload

Payload for EVENT_REVERSAL event type.

```typescript
interface EventReversalPayload {
  reversed_event_id: string;    // UUID of event being reversed
  reason?: string;              // Optional reason for reversal
}
```

### WebSocketConnection

Connection metadata stored in DynamoDB.

```typescript
interface WebSocketConnection {
  connection_id: string;        // API Gateway connection ID (partition key)
  game_id: string;              // Game being watched (GSI partition key)
  tenant_id: string;            // Tenant identifier for isolation
  user_id: string;              // User identifier from JWT
  connected_at: string;         // ISO-8601 timestamp
  ttl: number;                  // Unix timestamp for DynamoDB TTL (24 hours)
}
```

**DynamoDB Schema**:
- Table: `scorebase-websocket-connections`
- Partition Key: `connection_id` (string)
- GSI: `game-connections-index`
  - Partition Key: `game_id` (string)
  - Sort Key: `connected_at` (string)
- TTL Attribute: `ttl` (24 hours from connection)

### WebSocketMessage

Message format for WebSocket communication.

```typescript
interface WebSocketMessage {
  message_type: 'initial_snapshot' | 'snapshot_update' | 'ping' | 'pong';
  timestamp: string;            // ISO-8601 timestamp
  data?: GameSnapshot;          // Present for snapshot messages
  request_id?: string;          // Optional request correlation ID
}
```

### Enhanced GameEvent

Extended to include idempotency_key and occurred_at override.

```typescript
interface GameEvent {
  event_id: string;
  game_id: string;
  tenant_id: string;
  event_type: EventType | 'EVENT_REVERSAL';  // NEW event type
  event_version: string;
  occurred_at: string;          // May be client-provided for offline events
  payload: EventPayload;
  metadata: EventMetadata;
  ttl: number;
  idempotency_key?: string;     // NEW: Optional idempotency key
  reversed_by?: string;         // NEW: Event ID that reversed this event
}
```

## API Contract Updates

### REST API Enhancements

#### POST /v1/games/{gameId}/events (Enhanced)

**Request Body**:
```json
{
  "event_type": "GOAL_SCORED",
  "payload": {
    "team_id": "uuid",
    "player_id": "uuid",
    "period": 2,
    "time_remaining": "12:34",
    "spatial_coordinates": {
      "x": 0.75,
      "y": 0.42,
      "zone": "offensive"
    }
  },
  "occurred_at": "2024-01-15T19:23:45.123Z",  // Optional, for offline events
  "idempotency_key": "uuid"                    // Optional, for retry safety
}
```

**Response Body** (Enhanced):
```json
{
  "request_id": "uuid",
  "timestamp": "2024-01-15T19:23:45.500Z",
  "data": {
    "event": {
      "event_id": "uuid",
      "game_id": "uuid",
      "event_type": "GOAL_SCORED",
      "occurred_at": "2024-01-15T19:23:45.123Z",
      "payload": { ... }
    },
    "snapshot": {
      "game_id": "uuid",
      "home_score": 3,
      "away_score": 2,
      "period": 2,
      "clock_seconds": 754,
      "status": "in_progress",
      "recent_events": [ ... ],
      "snapshot_version": "1.0",
      "generated_at": "2024-01-15T19:23:45.500Z"
    }
  }
}
```

**New Error Responses**:
- `400 INVALID_SPATIAL_COORDINATES`: Coordinates outside 0.0-1.0 range
- `400 INVALID_TIMESTAMP`: occurred_at is in future or >24 hours old
- `409 DUPLICATE_EVENT`: Idempotency key already used (returns existing snapshot)

#### GET /v1/games/{gameId}/snapshot (New)

**Response Body**:
```json
{
  "request_id": "uuid",
  "timestamp": "2024-01-15T19:23:45.500Z",
  "data": {
    "snapshot": {
      "game_id": "uuid",
      "home_score": 3,
      "away_score": 2,
      "period": 2,
      "clock_seconds": 754,
      "status": "in_progress",
      "recent_events": [ ... ],
      "snapshot_version": "1.0",
      "generated_at": "2024-01-15T19:23:45.500Z"
    }
  }
}
```

**Error Responses**:
- `404 GAME_NOT_FOUND`: Game doesn't exist
- `403 FORBIDDEN`: Game doesn't belong to tenant

#### POST /v1/games/{gameId}/events (Event Reversal)

**Request Body**:
```json
{
  "event_type": "EVENT_REVERSAL",
  "payload": {
    "reversed_event_id": "uuid",
    "reason": "Incorrect player attribution"
  }
}
```

**Response Body**: Same as regular event creation (includes snapshot)

**New Error Responses**:
- `404 EVENT_NOT_FOUND`: reversed_event_id doesn't exist
- `409 EVENT_ALREADY_REVERSED`: Event has already been reversed
- `400 EVENT_NOT_REVERSIBLE`: Event type cannot be reversed

### WebSocket API

#### Connection Endpoint

**URL**: `wss://api.scorebase.com/v1/games/{gameId}/stream?token={jwt_token}`

**Connection Flow**:
1. Client initiates WebSocket connection with JWT in query parameter
2. Server validates JWT and extracts tenant_id, user_id
3. Server validates game_id exists and belongs to tenant
4. Server stores connection metadata in DynamoDB
5. Server sends initial snapshot message
6. Connection established

**Connection Rejection Codes**:
- `4001`: Authentication failed (invalid JWT)
- `4003`: Forbidden (game doesn't belong to tenant)
- `4004`: Not found (game doesn't exist)

#### Message Types

**Initial Snapshot** (sent on connection):
```json
{
  "message_type": "initial_snapshot",
  "timestamp": "2024-01-15T19:23:45.500Z",
  "data": {
    "game_id": "uuid",
    "home_score": 3,
    "away_score": 2,
    "period": 2,
    "clock_seconds": 754,
    "status": "in_progress",
    "recent_events": [ ... ],
    "snapshot_version": "1.0",
    "generated_at": "2024-01-15T19:23:45.500Z"
  }
}
```

**Snapshot Update** (broadcast on event creation):
```json
{
  "message_type": "snapshot_update",
  "timestamp": "2024-01-15T19:24:10.123Z",
  "data": {
    "game_id": "uuid",
    "home_score": 4,
    "away_score": 2,
    "period": 2,
    "clock_seconds": 729,
    "status": "in_progress",
    "recent_events": [ ... ],
    "snapshot_version": "1.0",
    "generated_at": "2024-01-15T19:24:10.123Z"
  }
}
```

**Ping** (sent every 30 seconds):
```json
{
  "message_type": "ping",
  "timestamp": "2024-01-15T19:24:15.000Z"
}
```

**Pong** (client response to ping):
```json
{
  "message_type": "pong",
  "timestamp": "2024-01-15T19:24:15.100Z"
}
```

## Database Schema Changes

### DynamoDB: scorebase-game-events (Enhanced)

**New Attributes**:
- `idempotency_key` (string, optional): Unique key for idempotent event creation
- `reversed_by` (string, optional): Event ID that reversed this event
- `spatial_coordinates` (map, optional): Nested object with x, y, zone fields

**New GSI**: `idempotency-key-index`
- Partition Key: `tenant_id` (string)
- Sort Key: `idempotency_key` (string)
- Projection: ALL
- Purpose: Fast lookup for duplicate detection

### DynamoDB: scorebase-websocket-connections (New Table)

**Table Schema**:
- Table Name: `scorebase-websocket-connections`
- Partition Key: `connection_id` (string)
- Billing Mode: PAY_PER_REQUEST
- TTL Attribute: `ttl` (24 hours)
- Encryption: AWS_MANAGED

**Attributes**:
- `connection_id` (string): API Gateway connection ID
- `game_id` (string): Game being watched
- `tenant_id` (string): Tenant identifier
- `user_id` (string): User identifier
- `connected_at` (string): ISO-8601 timestamp
- `ttl` (number): Unix timestamp for automatic cleanup

**GSI**: `game-connections-index`
- Partition Key: `game_id` (string)
- Sort Key: `connected_at` (string)
- Projection: ALL
- Purpose: Query all connections for a game

### RDS PostgreSQL: No Schema Changes

The existing `games` table in RDS already contains all necessary fields for game state. No schema changes required.


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

Before defining properties, I analyzed the acceptance criteria to identify redundancy:

**Redundancy Analysis**:
- Requirements 1.1, 1.2, 1.3 can be combined into a single coordinate validation property
- Requirements 2.2, 2.3, 2.4, 2.5, 10.1-10.5, 10.8 all test snapshot structure and can be combined
- Requirements 3.4 and 3.5 test tenant isolation and can be combined
- Requirements 4.2 and 4.3 test WebSocket authentication and can be combined
- Requirements 5.1, 5.2, 5.3, 5.4 all test multi-tenant WebSocket isolation and can be combined
- Requirements 6.2 and 6.3 test reversal validation and can be combined
- Requirements 6.5 and 6.6 are specific cases of 6.4 (reversal effects)
- Requirements 7.2, 7.3, 7.4 test timestamp validation and can be combined
- Requirements 9.1, 9.2, 9.3, 9.4, 9.5 test error response structure and can be combined
- Requirements 13.1, 13.2, 13.3 test idempotency and can be combined
- Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6 test WebSocket message structure and can be combined
- Requirements 15.1 and 15.2 test double-reversal prevention and can be combined

### Property 1: Spatial Coordinate Validation

For any event with spatial coordinates, both x and y values must be between 0.0 and 1.0 inclusive, and invalid coordinates must result in HTTP 400 with error code "INVALID_SPATIAL_COORDINATES" including the invalid values in error details.

**Validates: Requirements 1.1, 1.2, 1.3, 9.2**

### Property 2: Spatial Coordinate Round-Trip

For any event with valid spatial coordinates, submitting the event and then retrieving it should return the same coordinates with 4 decimal place precision.

**Validates: Requirements 1.4, 12.1, 12.2, 12.3, 12.4**

### Property 3: Event Creation Returns Snapshot

For any valid event creation, the API response must include a complete Game_Snapshot containing home_score, away_score, period, clock_seconds, status, recent_events (up to 10, ordered by occurred_at descending), snapshot_version, and generated_at fields.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8**

### Property 4: Tenant Isolation for Game Access

For any game and any tenant_id that doesn't match the game's tenant, attempting to access the game or create events should result in HTTP 403 with error code "FORBIDDEN".

**Validates: Requirements 3.4, 3.5**

### Property 5: WebSocket Authentication

For any WebSocket connection attempt, if the JWT token is invalid or missing, the connection must be rejected with code 4001, and if valid, the connection must be established and receive an initial Game_Snapshot.

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 6: WebSocket Broadcast

For any event created for a game, all WebSocket connections for that game with matching tenant_id must receive a snapshot_update message containing the updated Game_Snapshot.

**Validates: Requirements 4.5, 5.2, 6.8**

### Property 7: Multi-Tenant WebSocket Isolation

For any WebSocket connection attempt to a game from a different tenant, the connection must be rejected with code 4003, and broadcasts must only reach connections with matching tenant_id.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 8: Event Reversal Validation

For any EVENT_REVERSAL, the reversed_event_id must exist in the Event_Store, must not have been previously reversed, and must be a reversible event type (GOAL_SCORED, PENALTY_ASSESSED, SHOT_ON_GOAL), otherwise returning appropriate error codes (404 EVENT_NOT_FOUND, 409 EVENT_ALREADY_REVERSED, 400 EVENT_NOT_REVERSIBLE) with reversed_event_id in error details.

**Validates: Requirements 6.2, 6.3, 9.3, 15.1, 15.2, 15.6**

### Property 9: Event Reversal Round-Trip

For any reversible event (GOAL_SCORED, PENALTY_ASSESSED, SHOT_ON_GOAL), creating the event and then reversing it should restore the game state to its original values (scores, penalties, etc.) and return a Game_Snapshot reflecting the reversed state.

**Validates: Requirements 6.4, 6.5, 6.6, 6.7**

### Property 10: Offline Timestamp Preservation

For any event with a client-provided occurred_at timestamp that is not in the future and within 24 hours of current time, the Event_Store must preserve that timestamp, and invalid timestamps must result in HTTP 400 with error code "INVALID_TIMESTAMP" including the invalid timestamp in error details.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 9.4**

### Property 11: Event Ordering by Timestamp

For any set of events for a game, when stored in the Event_Store or included in a Game_Snapshot's recent_events, they must be ordered by occurred_at timestamp (descending for snapshots).

**Validates: Requirements 7.5, 7.6**

### Property 12: Error Response Structure

For any error condition, the API must return an error response containing code, message, and request_id fields, with error-specific details included where applicable (invalid coordinates, reversed_event_id, invalid timestamp).

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 13: Connection Lifecycle

For any WebSocket connection, when established it must receive a unique connection_id, and when disconnected (either by client or due to broadcast failure), it must be removed from the broadcast list and not receive further updates.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 14: Idempotent Event Creation

For any event with an idempotency_key, submitting the same event twice (same tenant_id and idempotency_key) must return HTTP 200 with the existing event's Game_Snapshot without creating a duplicate, and the idempotency_key must be stored in the Event_Store.

**Validates: Requirements 13.1, 13.2, 13.3, 13.4**

### Property 15: Idempotency Key Tenant Isolation

For any idempotency_key, the same key can be used by different tenants without conflict, ensuring idempotency_key uniqueness is enforced per tenant_id.

**Validates: Requirements 13.5**

### Property 16: WebSocket Message Structure

For any WebSocket message sent by the server, it must include a message_type field (initial_snapshot, snapshot_update, or ping) and a timestamp field, and snapshot messages must include the Game_Snapshot in the data field.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6**

## Error Handling

### Error Categories

**Validation Errors (HTTP 400)**:
- `INVALID_SPATIAL_COORDINATES`: Coordinates outside 0.0-1.0 range
- `INVALID_TIMESTAMP`: occurred_at in future or >24 hours old
- `INVALID_EVENT_PAYLOAD`: Event payload fails schema validation
- `EVENT_NOT_REVERSIBLE`: Event type cannot be reversed
- `MISSING_REQUIRED_FIELD`: Required field missing from request

**Not Found Errors (HTTP 404)**:
- `GAME_NOT_FOUND`: Game doesn't exist
- `EVENT_NOT_FOUND`: Event to reverse doesn't exist

**Authorization Errors (HTTP 403)**:
- `FORBIDDEN`: Resource doesn't belong to tenant

**Conflict Errors (HTTP 409)**:
- `EVENT_ALREADY_REVERSED`: Event has already been reversed
- Note: Idempotent requests return 200, not 409

**WebSocket Errors**:
- `4001`: Authentication failed
- `4003`: Forbidden (tenant mismatch)
- `4004`: Not found (game doesn't exist)

### Error Response Format

All REST API errors follow the standard format:

```json
{
  "error": {
    "code": "INVALID_SPATIAL_COORDINATES",
    "message": "Spatial coordinates must be between 0.0 and 1.0",
    "request_id": "uuid",
    "details": {
      "x": 1.5,
      "y": 0.42
    }
  }
}
```

### Error Handling Strategy

**Validation Errors**:
- Validate all inputs before processing
- Return specific error codes with field-level details
- Include invalid values in error details for debugging

**Multi-Tenant Isolation Errors**:
- Always validate tenant_id matches resource owner
- Return 403 Forbidden (never 404) to avoid information leakage
- Log authorization failures for security monitoring

**WebSocket Connection Errors**:
- Reject connections immediately on auth failure
- Use specific close codes for different error types
- Log all connection rejections with reason

**Broadcast Failures**:
- Remove failed connections from connection store
- Continue broadcasting to remaining connections
- Log broadcast failures for monitoring

**Idempotency Handling**:
- Return 200 (not 409) for duplicate idempotency keys
- Return the original response snapshot
- Log idempotent requests for monitoring

**Database Errors**:
- Wrap database errors in appropriate HTTP errors
- Never expose internal error details to clients
- Log full error details for debugging

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Specific coordinate values (0.0, 0.5, 1.0, boundary cases)
- Specific event reversal scenarios (goal reversal, penalty reversal)
- WebSocket connection lifecycle (connect, disconnect, reconnect)
- Error conditions (invalid game ID, missing fields)
- Integration between services (EventService → SnapshotService → BroadcastService)

**Property-Based Tests**: Verify universal properties across all inputs
- Coordinate validation with random values
- Snapshot structure with random game states
- Tenant isolation with random tenant IDs
- Event ordering with random timestamps
- Idempotency with random keys

### Property-Based Testing Configuration

**Library Selection**: Use `fast-check` for TypeScript property-based testing

**Test Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: scorekeeper-backend-support, Property {N}: {property_text}`

**Example Property Test Structure**:

```typescript
import fc from 'fast-check';

describe('Property 1: Spatial Coordinate Validation', () => {
  it('should reject coordinates outside 0.0-1.0 range', async () => {
    // Feature: scorekeeper-backend-support, Property 1
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -10, max: 10 }),  // Random x
        fc.double({ min: -10, max: 10 }),  // Random y
        async (x, y) => {
          const isValid = x >= 0.0 && x <= 1.0 && y >= 0.0 && y <= 1.0;
          
          if (isValid) {
            // Should accept valid coordinates
            const result = await createEventWithCoordinates(x, y);
            expect(result.statusCode).toBe(201);
          } else {
            // Should reject invalid coordinates
            const result = await createEventWithCoordinates(x, y);
            expect(result.statusCode).toBe(400);
            expect(result.error.code).toBe('INVALID_SPATIAL_COORDINATES');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Requirements

**Minimum Coverage Targets**:
- SnapshotService: 90% (critical for correctness)
- BroadcastService: 85% (critical for real-time sync)
- WebSocketHandler: 85% (critical for connection management)
- EventService enhancements: 90% (critical for data integrity)
- Validation functions: 95% (critical for security)

**Critical Test Scenarios**:
1. Spatial coordinate validation (all boundary cases)
2. Event reversal logic (all reversible event types)
3. Multi-tenant isolation (WebSocket and REST)
4. Idempotency (duplicate detection and response)
5. Snapshot generation (performance and correctness)
6. WebSocket broadcast (multiple connections, tenant filtering)
7. Offline timestamp handling (validation and preservation)
8. Error response format (all error types)

### Integration Testing

**WebSocket Integration Tests**:
- Establish connection and verify initial snapshot
- Create event and verify broadcast to all connections
- Test tenant isolation (connections from different tenants)
- Test connection cleanup on disconnect

**End-to-End Scenarios**:
1. ScoreKeeper creates event → Snapshot returned → Broadcast to other devices
2. ScoreKeeper reverses event → State updated → Broadcast to other devices
3. ScoreKeeper submits offline events → Timestamps preserved → Correct ordering
4. Network retry with idempotency key → No duplicate events created

### Performance Testing

While not part of unit tests, performance requirements must be validated:

**Performance Targets**:
- Event creation + snapshot: <200ms (p95)
- Snapshot retrieval: <100ms (p95)
- WebSocket broadcast: <50ms (p95)

**Load Testing Scenarios**:
- 100 events per second per game
- 1000 concurrent WebSocket connections per game
- Multiple games with simultaneous events

**Monitoring**:
- CloudWatch metrics for Lambda duration
- Custom metrics for snapshot generation time
- Custom metrics for broadcast latency
- Alarms for performance degradation

## Implementation Notes

### Performance Optimization

**Snapshot Generation**:
- Cache game state within single request to avoid duplicate RDS queries
- Use DynamoDB query with limit=10 for recent events (single query)
- Consider read replicas for RDS if snapshot queries impact write performance
- Monitor query performance and add indexes if needed

**WebSocket Broadcast**:
- Batch connection queries using DynamoDB query (not scan)
- Use API Gateway Management API batch operations when available
- Implement exponential backoff for failed broadcasts
- Consider SQS for async broadcast if latency target not met

**Connection Management**:
- Use DynamoDB TTL for automatic cleanup of stale connections
- Set TTL to 24 hours to handle long-lived connections
- Implement periodic cleanup Lambda if TTL not sufficient

### Security Considerations

**JWT Validation**:
- Validate JWT signature using Cognito public keys
- Check token expiration
- Extract tenant_id from custom claims
- Never trust client-provided tenant_id

**Multi-Tenant Isolation**:
- Always filter by tenant_id in database queries
- Validate tenant_id matches resource owner before any operation
- Use prepared statements to prevent SQL injection
- Log all authorization failures for security monitoring

**WebSocket Security**:
- Validate JWT on connection (query parameter)
- Re-validate tenant_id for each broadcast
- Close connections on any security violation
- Rate limit connection attempts per user

### Monitoring and Observability

**CloudWatch Metrics**:
- Custom metric: `SnapshotGenerationDuration`
- Custom metric: `BroadcastLatency`
- Custom metric: `ActiveWebSocketConnections`
- Custom metric: `EventReversalCount`
- Custom metric: `IdempotentRequestCount`

**CloudWatch Alarms**:
- Snapshot generation >200ms (p95)
- Broadcast latency >50ms (p95)
- WebSocket connection failures >5% of attempts
- Event creation errors >1% of requests

**Structured Logging**:
- Log all WebSocket connections with tenant_id, game_id, user_id
- Log all event reversals with original event details
- Log all idempotent requests (duplicate detection)
- Log all broadcast failures with connection details

### Deployment Considerations

**Infrastructure Changes**:
- Add WebSocket API Gateway to CDK stack
- Add WebSocket Lambda handler
- Add DynamoDB connections table with GSI
- Add GSI to events table for idempotency keys
- Update Lambda environment variables
- Update IAM roles for API Gateway Management API

**Migration Strategy**:
- Deploy infrastructure changes first (backward compatible)
- Deploy Lambda code with new features (feature flags if needed)
- Test WebSocket connections in staging
- Monitor performance metrics after deployment
- Gradual rollout to production games

**Rollback Plan**:
- WebSocket failures don't affect REST API (independent)
- Can disable WebSocket API Gateway if issues arise
- Event creation still works without snapshots (backward compatible)
- Idempotency and spatial coordinates are additive (optional fields)

### Future Enhancements

**Potential Improvements**:
- Redis cache for game snapshots (reduce RDS load)
- WebSocket message compression (reduce bandwidth)
- Snapshot delta updates (send only changes)
- Spatial coordinate indexing (for analytics queries)
- Event replay from history (for debugging)
- WebSocket reconnection with state recovery
- Multi-region WebSocket support (lower latency)

**Analytics Pipeline**:
- Stream events to S3 for analytics
- Build heat maps from spatial coordinates
- Aggregate statistics by zone
- Machine learning for event prediction

