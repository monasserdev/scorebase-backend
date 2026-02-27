# Requirements Document

## Introduction

This document specifies backend enhancements to support the ScoreKeeper iOS application, a spatial hockey event capture tool for venue scorekeepers. The backend must provide real-time synchronization, snapshot reconciliation, offline support, and spatial coordinate validation while maintaining the existing event-driven architecture with DynamoDB event store and RDS PostgreSQL.

## Glossary

- **ScoreKeeper**: The iOS application used by venue scorekeepers to capture hockey events in real-time
- **Event_API**: The backend REST API endpoint that accepts and processes game events
- **WebSocket_Gateway**: The AWS API Gateway WebSocket API for real-time bidirectional communication
- **Game_Snapshot**: A complete representation of current game state including scores, period, clock, status, and recent events
- **Spatial_Coordinates**: Normalized x,y coordinates (0.0-1.0 range) representing event location on the playing surface
- **Event_Store**: DynamoDB table storing immutable event history
- **Game_State_DB**: RDS PostgreSQL database storing current game state
- **Event_Reversal**: A special event type that undoes the effects of a previously recorded event
- **Snapshot_Service**: Backend service responsible for generating game snapshots from current state
- **Broadcast_Service**: Backend service responsible for distributing snapshot updates to connected WebSocket clients
- **Tenant_ID**: Unique identifier for multi-tenant isolation extracted from JWT claims

## Requirements

### Requirement 1: Spatial Coordinate Validation

**User Story:** As a backend system, I want to validate spatial coordinates from ScoreKeeper events, so that only valid location data is persisted and analytics remain accurate.

#### Acceptance Criteria

1. WHEN an event contains spatial coordinates, THE Event_API SHALL validate that the x coordinate is between 0.0 and 1.0 inclusive
2. WHEN an event contains spatial coordinates, THE Event_API SHALL validate that the y coordinate is between 0.0 and 1.0 inclusive
3. IF spatial coordinates are outside the valid range, THEN THE Event_API SHALL return HTTP 400 with error code "INVALID_SPATIAL_COORDINATES"
4. WHEN spatial coordinates are valid, THE Event_Store SHALL persist the coordinates in the event payload
5. THE Event_API SHALL accept events without spatial coordinates for backward compatibility

### Requirement 2: Game Snapshot Response After Event Creation

**User Story:** As a ScoreKeeper user, I want to receive the complete game state after submitting an event, so that my UI can reconcile optimistic updates with authoritative backend state.

#### Acceptance Criteria

1. WHEN an event is successfully created, THE Event_API SHALL return a Game_Snapshot in the response body
2. THE Game_Snapshot SHALL include current scores for both teams
3. THE Game_Snapshot SHALL include current period number
4. THE Game_Snapshot SHALL include current clock time
5. THE Game_Snapshot SHALL include game status
6. THE Game_Snapshot SHALL include the 10 most recent events ordered by occurred_at timestamp descending
7. WHEN generating the snapshot, THE Snapshot_Service SHALL complete within 200 milliseconds at the 95th percentile

### Requirement 3: Game Snapshot Retrieval Endpoint

**User Story:** As a ScoreKeeper user, I want to retrieve the current game state when launching the app or reconnecting, so that I can resume scoring from the correct state.

#### Acceptance Criteria

1. THE Event_API SHALL provide a GET endpoint at /v1/games/{gameId}/snapshot
2. WHEN a valid gameId is provided, THE Event_API SHALL return a Game_Snapshot
3. WHEN an invalid gameId is provided, THE Event_API SHALL return HTTP 404 with error code "GAME_NOT_FOUND"
4. THE Event_API SHALL validate tenant_id from JWT matches the game's tenant_id
5. IF tenant_id does not match, THEN THE Event_API SHALL return HTTP 403 with error code "FORBIDDEN"
6. THE Snapshot_Service SHALL complete snapshot retrieval within 100 milliseconds at the 95th percentile

### Requirement 4: WebSocket Real-Time Synchronization

**User Story:** As a ScoreKeeper user, I want real-time updates when other scorekeepers submit events, so that multiple devices stay synchronized during the game.

#### Acceptance Criteria

1. THE WebSocket_Gateway SHALL provide a connection endpoint at wss://api.scorebase.com/v1/games/{gameId}/stream
2. WHEN a client connects, THE WebSocket_Gateway SHALL authenticate the JWT token
3. IF authentication fails, THEN THE WebSocket_Gateway SHALL close the connection with code 4001
4. WHEN authentication succeeds, THE WebSocket_Gateway SHALL send an initial Game_Snapshot to the client
5. WHEN an event is created for a game, THE Broadcast_Service SHALL send the updated Game_Snapshot to all connected clients for that game
6. THE Broadcast_Service SHALL complete snapshot broadcast within 50 milliseconds at the 95th percentile
7. THE WebSocket_Gateway SHALL send a ping message every 30 seconds
8. WHEN a client does not respond to ping within 10 seconds, THE WebSocket_Gateway SHALL close the connection
9. THE WebSocket_Gateway SHALL support at least 1000 concurrent connections per game

### Requirement 5: Multi-Tenant WebSocket Isolation

**User Story:** As a league administrator, I want WebSocket connections isolated by tenant, so that scorekeepers cannot see events from other leagues' games.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established, THE WebSocket_Gateway SHALL extract tenant_id from the JWT claims
2. WHEN broadcasting a snapshot, THE Broadcast_Service SHALL send updates only to connections with matching tenant_id
3. IF a client attempts to connect to a game from a different tenant, THEN THE WebSocket_Gateway SHALL close the connection with code 4003
4. THE WebSocket_Gateway SHALL validate tenant_id on every connection attempt

### Requirement 6: Event Reversal Support

**User Story:** As a ScoreKeeper user, I want to undo incorrectly recorded events, so that game statistics and scores remain accurate.

#### Acceptance Criteria

1. THE Event_API SHALL accept events with event_type "EVENT_REVERSAL"
2. WHEN an EVENT_REVERSAL is received, THE Event_API SHALL validate that reversed_event_id exists in the Event_Store
3. IF reversed_event_id does not exist, THEN THE Event_API SHALL return HTTP 404 with error code "EVENT_NOT_FOUND"
4. WHEN an EVENT_REVERSAL is valid, THE Event_API SHALL reverse the effects of the original event in Game_State_DB
5. WHEN reversing a GOAL_SCORED event, THE Event_API SHALL decrement the team's score by 1
6. WHEN reversing a PENALTY_ASSESSED event, THE Event_API SHALL remove the penalty from active penalties
7. WHEN an EVENT_REVERSAL is processed, THE Event_API SHALL return a Game_Snapshot reflecting the reversed state
8. WHEN an EVENT_REVERSAL is processed, THE Broadcast_Service SHALL broadcast the updated Game_Snapshot to all connected clients

### Requirement 7: Offline Event Timestamp Preservation

**User Story:** As a ScoreKeeper user, I want events recorded offline to maintain their original timestamps, so that event history reflects when events actually occurred.

#### Acceptance Criteria

1. WHEN an event includes an occurred_at timestamp, THE Event_API SHALL preserve the client-provided timestamp
2. THE Event_API SHALL validate that occurred_at is not in the future
3. THE Event_API SHALL validate that occurred_at is within 24 hours of the current time
4. IF occurred_at is invalid, THEN THE Event_API SHALL return HTTP 400 with error code "INVALID_TIMESTAMP"
5. WHEN storing events, THE Event_Store SHALL order events by occurred_at timestamp
6. WHEN generating a Game_Snapshot, THE Snapshot_Service SHALL order recent events by occurred_at timestamp descending

### Requirement 8: Performance Requirements

**User Story:** As a ScoreKeeper user, I want fast response times, so that I can capture events during fast-paced gameplay without delays.

#### Acceptance Criteria

1. THE Event_API SHALL complete event creation and snapshot response within 200 milliseconds at the 95th percentile
2. THE Snapshot_Service SHALL complete snapshot retrieval within 100 milliseconds at the 95th percentile
3. THE Broadcast_Service SHALL complete WebSocket broadcast within 50 milliseconds at the 95th percentile
4. THE Event_API SHALL maintain these performance targets under load of 100 events per second per game

### Requirement 9: Error Response Format

**User Story:** As a ScoreKeeper developer, I want consistent error responses, so that I can handle errors predictably in the iOS app.

#### Acceptance Criteria

1. WHEN an error occurs, THE Event_API SHALL return an error response with code, message, and request_id fields
2. WHEN spatial coordinates are invalid, THE Event_API SHALL include the invalid values in the error details
3. WHEN an EVENT_REVERSAL fails, THE Event_API SHALL include the reversed_event_id in the error details
4. WHEN a timestamp is invalid, THE Event_API SHALL include the invalid timestamp in the error details
5. THE Event_API SHALL include request_id in all error responses for tracing

### Requirement 10: Game Snapshot Schema

**User Story:** As a ScoreKeeper developer, I want a well-defined snapshot schema, so that I can reliably parse and display game state.

#### Acceptance Criteria

1. THE Game_Snapshot SHALL include a home_score integer field
2. THE Game_Snapshot SHALL include an away_score integer field
3. THE Game_Snapshot SHALL include a period integer field
4. THE Game_Snapshot SHALL include a clock_seconds integer field
5. THE Game_Snapshot SHALL include a status string field with values "scheduled", "in_progress", "final", or "postponed"
6. THE Game_Snapshot SHALL include a recent_events array containing the 10 most recent events
7. WHEN recent_events contains fewer than 10 events, THE Game_Snapshot SHALL include all available events
8. THE Game_Snapshot SHALL include a snapshot_version string field for schema versioning

### Requirement 11: WebSocket Connection Lifecycle

**User Story:** As a ScoreKeeper user, I want reliable WebSocket connections, so that I receive real-time updates consistently.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established, THE WebSocket_Gateway SHALL assign a unique connection_id
2. WHEN a client disconnects, THE WebSocket_Gateway SHALL remove the connection from the broadcast list
3. IF a broadcast fails for a specific connection, THEN THE WebSocket_Gateway SHALL close that connection
4. THE WebSocket_Gateway SHALL log connection establishment with tenant_id, game_id, and connection_id
5. THE WebSocket_Gateway SHALL log connection closure with connection_id and reason

### Requirement 12: Spatial Coordinate Storage

**User Story:** As a data analyst, I want spatial coordinates stored with events, so that I can analyze event locations for future features.

#### Acceptance Criteria

1. WHEN an event includes spatial coordinates, THE Event_Store SHALL persist x, y, and zone fields in the event payload
2. THE Event_Store SHALL store x and y as decimal values with precision to 4 decimal places
3. THE Event_Store SHALL store zone as a string field
4. WHEN retrieving events, THE Event_API SHALL include spatial coordinates in the event payload if present

### Requirement 13: Idempotent Event Creation

**User Story:** As a ScoreKeeper user, I want duplicate event submissions to be handled safely, so that network retries don't create duplicate events.

#### Acceptance Criteria

1. WHEN an event includes an idempotency_key, THE Event_API SHALL check if an event with that key already exists
2. IF an event with the same idempotency_key exists, THEN THE Event_API SHALL return the existing event's Game_Snapshot without creating a duplicate
3. THE Event_API SHALL return HTTP 200 for idempotent requests
4. THE Event_API SHALL store idempotency_key in the Event_Store
5. THE Event_API SHALL enforce idempotency_key uniqueness per tenant_id

### Requirement 14: WebSocket Message Format

**User Story:** As a ScoreKeeper developer, I want a consistent WebSocket message format, so that I can parse messages reliably.

#### Acceptance Criteria

1. THE WebSocket_Gateway SHALL send messages with a message_type field
2. WHEN sending an initial snapshot, THE WebSocket_Gateway SHALL set message_type to "initial_snapshot"
3. WHEN broadcasting an update, THE WebSocket_Gateway SHALL set message_type to "snapshot_update"
4. WHEN sending a ping, THE WebSocket_Gateway SHALL set message_type to "ping"
5. THE WebSocket_Gateway SHALL include a timestamp field in all messages
6. THE WebSocket_Gateway SHALL include the Game_Snapshot in the data field for snapshot messages

### Requirement 15: Event Reversal Validation

**User Story:** As a backend system, I want to validate event reversals, so that only reversible events can be undone.

#### Acceptance Criteria

1. WHEN an EVENT_REVERSAL is received, THE Event_API SHALL validate that the original event has not already been reversed
2. IF an event has already been reversed, THEN THE Event_API SHALL return HTTP 409 with error code "EVENT_ALREADY_REVERSED"
3. THE Event_API SHALL allow reversal of GOAL_SCORED events
4. THE Event_API SHALL allow reversal of PENALTY_ASSESSED events
5. THE Event_API SHALL allow reversal of SHOT_ON_GOAL events
6. IF an event type is not reversible, THEN THE Event_API SHALL return HTTP 400 with error code "EVENT_NOT_REVERSIBLE"
