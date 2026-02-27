# Implementation Plan: ScoreKeeper Backend Support

## Overview

This implementation plan breaks down the ScoreKeeper backend support feature into discrete coding tasks. The feature adds real-time WebSocket synchronization, game snapshot generation, offline event support, spatial coordinate validation, and event reversal capabilities to the existing ScoreBase backend.

The implementation follows a bottom-up approach: data models → repositories → services → handlers → infrastructure → testing. Each task builds on previous work to ensure incremental progress with early validation.

## Tasks

- [ ] 1. Create data models and TypeScript interfaces
  - [x] 1.1 Define GameSnapshot interface
    - Create interface with home_score, away_score, period, clock_seconds, status, recent_events, snapshot_version, generated_at fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1-10.8_
  
  - [x] 1.2 Define SpatialCoordinates interface
    - Create interface with x, y, zone fields
    - Add validation constraints (0.0-1.0 range)
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [x] 1.3 Define WebSocketConnection interface
    - Create interface with connection_id, game_id, tenant_id, user_id, connected_at, ttl fields
    - _Requirements: 4.1, 11.1_
  
  - [~] 1.4 Define WebSocketMessage interface
    - Create interface with message_type, timestamp, data, request_id fields
    - Define message_type enum (initial_snapshot, snapshot_update, ping, pong)
    - _Requirements: 14.1-14.6_
  
  - [~] 1.5 Extend GameEvent interface
    - Add idempotency_key, reversed_by, spatial_coordinates optional fields
    - Add EVENT_REVERSAL to EventType enum
    - _Requirements: 6.1, 13.1, 1.4_
  
  - [~] 1.6 Define EventReversalPayload interface
    - Create interface with reversed_event_id, reason fields
    - _Requirements: 6.2_
  
  - [~] 1.7 Add new error codes
    - Add INVALID_SPATIAL_COORDINATES, INVALID_TIMESTAMP, EVENT_NOT_FOUND, EVENT_ALREADY_REVERSED, EVENT_NOT_REVERSIBLE to error code enum
    - _Requirements: 1.3, 6.3, 7.4, 15.2, 15.6_

- [ ] 2. Implement spatial coordinate validation utility
  - [~] 2.1 Create validateSpatialCoordinates function
    - Implement validation logic for x and y in 0.0-1.0 range
    - Return validation result with error details
    - _Requirements: 1.1, 1.2_
  
  - [ ]* 2.2 Write property test for spatial coordinate validation
    - **Property 1: Spatial Coordinate Validation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 9.2**
    - Generate random coordinates and verify validation logic
    - Test boundary cases (0.0, 1.0, -0.1, 1.1)
  
  - [ ]* 2.3 Write unit tests for spatial coordinate validation
    - Test valid coordinates (0.0, 0.5, 1.0)
    - Test invalid coordinates (-0.1, 1.1, 2.0)
    - Test edge cases (exactly 0.0, exactly 1.0)
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Update DynamoDB schema and repositories
  - [~] 3.1 Create ConnectionRepository
    - Implement storeConnection, removeConnection, getConnectionsByGame, getConnection methods
    - Use DynamoDB client with proper error handling
    - _Requirements: 4.1, 11.1, 11.2_
  
  - [~] 3.2 Enhance EventRepository with idempotency support
    - Add findByIdempotencyKey method using GSI query
    - Add isEventReversed method to check for reversal events
    - _Requirements: 13.1, 15.1_
  
  - [~] 3.3 Update DynamoDB config for connections table
    - Add table name constant for scorebase-websocket-connections
    - Add GSI name constant for game-connections-index
    - _Requirements: 4.1_
  
  - [ ]* 3.4 Write unit tests for ConnectionRepository
    - Test storeConnection, removeConnection, getConnectionsByGame
    - Test tenant isolation in getConnectionsByGame
    - Mock DynamoDB client
    - _Requirements: 4.1, 5.2, 11.1, 11.2_
  
  - [ ]* 3.5 Write unit tests for EventRepository enhancements
    - Test findByIdempotencyKey with valid and invalid keys
    - Test isEventReversed for reversed and non-reversed events
    - _Requirements: 13.1, 15.1_

- [ ] 4. Implement SnapshotService
  - [~] 4.1 Create SnapshotService class
    - Implement generateSnapshot method (fetch from RDS + DynamoDB)
    - Implement generateSnapshotFromGame method (optimized path)
    - Add performance monitoring for <200ms target
    - _Requirements: 2.1-2.7, 3.1, 3.2, 8.1, 8.2_
  
  - [~] 4.2 Implement snapshot generation logic
    - Query GameRepository for current game state
    - Query EventRepository for 10 most recent events
    - Order events by occurred_at descending
    - Construct GameSnapshot with all required fields
    - _Requirements: 2.2-2.6, 10.1-10.8_
  
  - [ ]* 4.3 Write property test for snapshot structure
    - **Property 3: Event Creation Returns Snapshot**
    - **Validates: Requirements 2.1-2.6, 10.1-10.8**
    - Generate random game states and verify snapshot structure
    - Verify all required fields present
  
  - [ ]* 4.4 Write unit tests for SnapshotService
    - Test generateSnapshot with valid game
    - Test generateSnapshot with non-existent game (404)
    - Test generateSnapshot with tenant mismatch (403)
    - Test generateSnapshotFromGame optimization
    - Test recent_events ordering and limit
    - _Requirements: 2.1-2.7, 3.3, 3.4, 3.5_

- [ ] 5. Implement BroadcastService
  - [~] 5.1 Create BroadcastService class
    - Implement broadcastSnapshot method
    - Implement sendSnapshotToConnection method
    - Use API Gateway Management API for posting messages
    - _Requirements: 4.5, 4.6, 8.3_
  
  - [~] 5.2 Implement connection filtering and tenant isolation
    - Query ConnectionRepository for game connections
    - Filter connections by tenant_id
    - Handle failed connections by removing from store
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [~] 5.3 Implement batch broadcasting logic
    - Iterate through connections and send messages
    - Log broadcast failures
    - Remove failed connections
    - Add performance monitoring for <50ms target
    - _Requirements: 4.6, 8.3, 11.3_
  
  - [ ]* 5.4 Write property test for multi-tenant WebSocket isolation
    - **Property 7: Multi-Tenant WebSocket Isolation**
    - **Validates: Requirements 5.1-5.4**
    - Generate random tenant IDs and verify isolation
    - Verify broadcasts only reach matching tenants
  
  - [ ]* 5.5 Write unit tests for BroadcastService
    - Test broadcastSnapshot with multiple connections
    - Test tenant filtering (only matching tenant_id receives updates)
    - Test failed connection handling
    - Mock API Gateway Management API
    - _Requirements: 4.5, 5.2, 11.3_

- [ ] 6. Enhance EventService with new features
  - [~] 6.1 Add createEventWithSnapshot method
    - Validate spatial coordinates if present
    - Check idempotency_key for duplicates
    - Preserve client-provided occurred_at timestamp
    - Create event in DynamoDB
    - Update game state in RDS
    - Generate snapshot using SnapshotService
    - Trigger broadcast using BroadcastService
    - _Requirements: 1.1-1.5, 2.1, 7.1, 13.1-13.3_
  
  - [~] 6.2 Implement spatial coordinate validation in event creation
    - Call validateSpatialCoordinates utility
    - Return 400 INVALID_SPATIAL_COORDINATES on failure
    - Include invalid values in error details
    - _Requirements: 1.1, 1.2, 1.3, 9.2_
  
  - [~] 6.3 Implement idempotency check
    - Query EventRepository.findByIdempotencyKey
    - If found, return existing event's snapshot (200)
    - If not found, proceed with event creation
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [~] 6.4 Implement offline timestamp validation
    - Validate occurred_at not in future
    - Validate occurred_at within 24 hours
    - Return 400 INVALID_TIMESTAMP on failure
    - Include invalid timestamp in error details
    - _Requirements: 7.2, 7.3, 7.4, 9.4_
  
  - [~] 6.5 Add reverseEvent method
    - Validate reversed_event_id exists
    - Validate event not already reversed
    - Validate event type is reversible
    - Apply reverse logic (decrement score, remove penalty, etc.)
    - Create EVENT_REVERSAL event
    - Generate snapshot
    - Trigger broadcast
    - _Requirements: 6.1-6.8, 15.1-15.6_
  
  - [~] 6.6 Implement reversal logic for GOAL_SCORED
    - Decrement team score by 1
    - Update game state in RDS
    - _Requirements: 6.5_
  
  - [~] 6.7 Implement reversal logic for PENALTY_ASSESSED
    - Remove penalty from active penalties
    - Update game state in RDS
    - _Requirements: 6.6, 15.4_
  
  - [~] 6.8 Implement reversal logic for SHOT_ON_GOAL
    - Update shot statistics
    - Update game state in RDS
    - _Requirements: 15.5_
  
  - [ ]* 6.9 Write property test for spatial coordinate round-trip
    - **Property 2: Spatial Coordinate Round-Trip**
    - **Validates: Requirements 1.4, 12.1-12.4**
    - Create event with coordinates, retrieve and verify precision
  
  - [ ]* 6.10 Write property test for event reversal round-trip
    - **Property 9: Event Reversal Round-Trip**
    - **Validates: Requirements 6.4-6.7**
    - Create reversible event, reverse it, verify state restored
  
  - [ ]* 6.11 Write property test for offline timestamp preservation
    - **Property 10: Offline Timestamp Preservation**
    - **Validates: Requirements 7.1-7.4, 9.4**
    - Generate random timestamps and verify preservation/validation
  
  - [ ]* 6.12 Write property test for idempotent event creation
    - **Property 14: Idempotent Event Creation**
    - **Validates: Requirements 13.1-13.4**
    - Submit same event twice with idempotency_key, verify no duplicate
  
  - [ ]* 6.13 Write property test for idempotency tenant isolation
    - **Property 15: Idempotency Key Tenant Isolation**
    - **Validates: Requirements 13.5**
    - Use same key with different tenants, verify no conflict
  
  - [ ]* 6.14 Write unit tests for createEventWithSnapshot
    - Test event creation with valid spatial coordinates
    - Test event creation without spatial coordinates
    - Test idempotency (duplicate key returns existing snapshot)
    - Test offline timestamp preservation
    - Test invalid spatial coordinates (400)
    - Test invalid timestamp (400)
    - _Requirements: 1.1-1.5, 2.1, 7.1-7.4, 13.1-13.3_
  
  - [ ]* 6.15 Write unit tests for reverseEvent
    - Test GOAL_SCORED reversal (score decremented)
    - Test PENALTY_ASSESSED reversal (penalty removed)
    - Test SHOT_ON_GOAL reversal (stats updated)
    - Test non-existent event (404 EVENT_NOT_FOUND)
    - Test already reversed event (409 EVENT_ALREADY_REVERSED)
    - Test non-reversible event type (400 EVENT_NOT_REVERSIBLE)
    - _Requirements: 6.1-6.8, 15.1-15.6_

- [~] 7. Checkpoint - Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Create WebSocketHandler Lambda
  - [~] 8.1 Create WebSocketHandler class
    - Implement handleConnect method
    - Implement handleDisconnect method
    - Implement handleMessage method (ping/pong)
    - _Requirements: 4.1, 4.2, 11.1, 11.2_
  
  - [~] 8.2 Implement handleConnect logic
    - Extract JWT from query string parameter
    - Validate JWT using existing middleware
    - Extract tenant_id and user_id from claims
    - Extract game_id from path parameters
    - Validate game exists and belongs to tenant
    - Store connection in ConnectionRepository
    - Generate and send initial snapshot
    - Return 200 on success, 4001/4003/4004 on failure
    - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.3, 11.1_
  
  - [~] 8.3 Implement handleDisconnect logic
    - Extract connection_id from event
    - Remove connection from ConnectionRepository
    - Log disconnection with connection_id and reason
    - Return 200
    - _Requirements: 11.2, 11.5_
  
  - [~] 8.4 Implement handleMessage logic
    - Parse incoming message
    - Handle ping messages (respond with pong)
    - Log message receipt
    - Return 200
    - _Requirements: 4.7, 14.4_
  
  - [ ]* 8.5 Write property test for WebSocket authentication
    - **Property 5: WebSocket Authentication**
    - **Validates: Requirements 4.2, 4.3, 4.4**
    - Test with valid and invalid JWT tokens
    - Verify connection establishment and rejection
  
  - [ ]* 8.6 Write property test for connection lifecycle
    - **Property 13: Connection Lifecycle**
    - **Validates: Requirements 11.1-11.3**
    - Test connection establishment, disconnection, and cleanup
  
  - [ ]* 8.7 Write property test for WebSocket message structure
    - **Property 16: WebSocket Message Structure**
    - **Validates: Requirements 14.1-14.6**
    - Verify all message types have required fields
  
  - [ ]* 8.8 Write unit tests for WebSocketHandler
    - Test handleConnect with valid JWT (200, initial snapshot sent)
    - Test handleConnect with invalid JWT (4001)
    - Test handleConnect with tenant mismatch (4003)
    - Test handleConnect with non-existent game (4004)
    - Test handleDisconnect (connection removed)
    - Test handleMessage ping/pong
    - _Requirements: 4.2-4.4, 11.1, 11.2, 11.5_

- [ ] 9. Enhance API handler with new endpoints
  - [~] 9.1 Add GET /v1/games/{gameId}/snapshot endpoint
    - Extract tenant_id from JWT
    - Extract game_id from path parameters
    - Call SnapshotService.generateSnapshot
    - Return snapshot in response body
    - Handle errors (404, 403)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [~] 9.2 Update POST /v1/games/{gameId}/events endpoint
    - Call EventService.createEventWithSnapshot instead of createEvent
    - Return event and snapshot in response body
    - Handle new error codes (INVALID_SPATIAL_COORDINATES, INVALID_TIMESTAMP)
    - _Requirements: 1.1-1.5, 2.1-2.7, 7.1-7.4, 9.1-9.5_
  
  - [~] 9.3 Add support for EVENT_REVERSAL event type
    - Detect EVENT_REVERSAL event_type
    - Call EventService.reverseEvent
    - Return reversal event and snapshot
    - Handle reversal-specific errors
    - _Requirements: 6.1-6.8, 15.1-15.6_
  
  - [ ]* 9.4 Write property test for tenant isolation
    - **Property 4: Tenant Isolation for Game Access**
    - **Validates: Requirements 3.4, 3.5**
    - Test game access with mismatched tenant_id
    - Verify 403 response
  
  - [ ]* 9.5 Write property test for error response structure
    - **Property 12: Error Response Structure**
    - **Validates: Requirements 9.1-9.5**
    - Generate various error conditions and verify response format
  
  - [ ]* 9.6 Write property test for event reversal validation
    - **Property 8: Event Reversal Validation**
    - **Validates: Requirements 6.2, 6.3, 9.3, 15.1, 15.2, 15.6**
    - Test reversal of non-existent, already-reversed, and non-reversible events
  
  - [ ]* 9.7 Write integration tests for snapshot endpoint
    - Test GET /v1/games/{gameId}/snapshot with valid game
    - Test with non-existent game (404)
    - Test with tenant mismatch (403)
    - _Requirements: 3.1-3.6_
  
  - [ ]* 9.8 Write integration tests for enhanced event creation
    - Test POST with spatial coordinates
    - Test POST with occurred_at timestamp
    - Test POST with idempotency_key
    - Test POST with EVENT_REVERSAL
    - Verify snapshot in response
    - _Requirements: 1.1-1.5, 2.1-2.7, 6.1-6.8, 7.1-7.4, 13.1-13.5_

- [ ] 10. Update CDK infrastructure
  - [~] 10.1 Add WebSocket API Gateway to CDK stack
    - Create WebSocket API Gateway resource
    - Define $connect, $disconnect, $default routes
    - Configure JWT authorizer for $connect route
    - Set up stage and deployment
    - _Requirements: 4.1, 4.2_
  
  - [~] 10.2 Create WebSocket Lambda function
    - Add WebSocketHandler Lambda to stack
    - Configure environment variables
    - Grant API Gateway Management API permissions
    - Set up CloudWatch Logs
    - _Requirements: 4.1_
  
  - [~] 10.3 Create DynamoDB connections table
    - Add scorebase-websocket-connections table
    - Configure partition key (connection_id)
    - Add GSI (game-connections-index)
    - Enable TTL on ttl attribute
    - Set billing mode to PAY_PER_REQUEST
    - _Requirements: 4.1, 11.1_
  
  - [~] 10.4 Add idempotency GSI to events table
    - Add idempotency-key-index GSI to scorebase-game-events table
    - Configure partition key (tenant_id) and sort key (idempotency_key)
    - Set projection to ALL
    - _Requirements: 13.1_
  
  - [~] 10.5 Update Lambda IAM permissions
    - Grant DynamoDB access to connections table
    - Grant API Gateway Management API execute-api:ManageConnections permission
    - Grant DynamoDB query access to idempotency GSI
    - _Requirements: 4.5, 13.1_
  
  - [~] 10.6 Add CloudWatch alarms
    - Add alarm for snapshot generation duration >200ms
    - Add alarm for broadcast latency >50ms
    - Add alarm for WebSocket connection failures >5%
    - Add alarm for event creation errors >1%
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ]* 10.7 Write CDK stack tests
    - Verify WebSocket API Gateway created
    - Verify connections table created with correct schema
    - Verify GSI created on events table
    - Verify IAM permissions granted

- [~] 11. Checkpoint - Ensure infrastructure deploys successfully
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Add performance monitoring and logging
  - [~] 12.1 Add custom CloudWatch metrics
    - Add SnapshotGenerationDuration metric
    - Add BroadcastLatency metric
    - Add ActiveWebSocketConnections metric
    - Add EventReversalCount metric
    - Add IdempotentRequestCount metric
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [~] 12.2 Enhance structured logging
    - Log WebSocket connections with tenant_id, game_id, user_id, connection_id
    - Log event reversals with original event details
    - Log idempotent requests (duplicate detection)
    - Log broadcast failures with connection details
    - _Requirements: 11.4, 11.5_
  
  - [ ]* 12.3 Write unit tests for metrics and logging
    - Test metric emission for snapshot generation
    - Test metric emission for broadcasts
    - Test logging for WebSocket lifecycle
    - Test logging for event reversals

- [ ] 13. Update API documentation
  - [~] 13.1 Update OpenAPI spec with new endpoints
    - Add GET /v1/games/{gameId}/snapshot endpoint
    - Update POST /v1/games/{gameId}/events with snapshot response
    - Add EVENT_REVERSAL event type documentation
    - Add spatial_coordinates, occurred_at, idempotency_key parameters
    - Add new error codes
    - _Requirements: All_
  
  - [~] 13.2 Document WebSocket API
    - Document connection URL format
    - Document authentication (JWT in query parameter)
    - Document message types (initial_snapshot, snapshot_update, ping, pong)
    - Document error codes (4001, 4003, 4004)
    - _Requirements: 4.1-4.8, 14.1-14.6_
  
  - [~] 13.3 Create integration guide for iOS developers
    - Document snapshot reconciliation pattern
    - Document WebSocket connection lifecycle
    - Document offline event submission
    - Document event reversal flow
    - Document idempotency key usage
    - _Requirements: All_

- [ ] 14. Property-based test for WebSocket broadcast
  - [ ]* 14.1 Write property test for WebSocket broadcast
    - **Property 6: WebSocket Broadcast**
    - **Validates: Requirements 4.5, 5.2, 6.8**
    - Create event and verify all matching connections receive update
    - Test with multiple connections and tenants

- [ ] 15. Property-based test for event ordering
  - [ ]* 15.1 Write property test for event ordering
    - **Property 11: Event Ordering by Timestamp**
    - **Validates: Requirements 7.5, 7.6**
    - Generate random events with timestamps and verify ordering

- [ ] 16. Final integration tests
  - [ ]* 16.1 Write end-to-end WebSocket integration test
    - Establish WebSocket connection
    - Verify initial snapshot received
    - Create event via REST API
    - Verify snapshot_update received via WebSocket
    - Test with multiple connections
    - Test tenant isolation
    - _Requirements: 4.1-4.8, 5.1-5.4_
  
  - [ ]* 16.2 Write end-to-end event reversal integration test
    - Create GOAL_SCORED event
    - Verify score incremented
    - Create EVENT_REVERSAL
    - Verify score decremented
    - Verify WebSocket broadcast of reversal
    - _Requirements: 6.1-6.8_
  
  - [ ]* 16.3 Write end-to-end offline event integration test
    - Submit event with past occurred_at timestamp
    - Verify timestamp preserved
    - Verify event ordering in snapshot
    - _Requirements: 7.1-7.6_
  
  - [ ]* 16.4 Write end-to-end idempotency integration test
    - Submit event with idempotency_key
    - Submit same event again
    - Verify only one event created
    - Verify same snapshot returned
    - _Requirements: 13.1-13.5_

- [~] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (16 properties total)
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- Implementation uses TypeScript with Node.js 20.x runtime
- All new code follows existing backend standards (event-driven, multi-tenant, protocol-oriented)
- Performance targets: Event creation <200ms, Snapshot retrieval <100ms, Broadcast <50ms
