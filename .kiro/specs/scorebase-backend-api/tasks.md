# Implementation Plan: ScoreBase Backend API

## Overview

This implementation plan breaks down the ScoreBase Backend API into discrete, actionable tasks. The backend is a multi-tenant, event-driven REST API built on AWS serverless infrastructure using TypeScript/Node.js. The implementation follows a bottom-up approach: infrastructure → database → core services → API endpoints → testing → deployment.

The architecture uses a modular monolith Lambda function with RDS PostgreSQL for operational data, DynamoDB for event sourcing, and Cognito for authentication. All tasks build incrementally, with checkpoints to validate progress.

## Tasks

- [ ] 1. Set up project structure and infrastructure foundation
  - [x] 1.1 Initialize TypeScript Node.js project with AWS CDK
    - Create package.json with dependencies (aws-sdk, pg, pg-pool, jsonwebtoken, uuid, ajv)
    - Configure TypeScript with strict mode and ES2020 target
    - Set up AWS CDK project structure (lib/, bin/, cdk.json)
    - Create .gitignore for node_modules, dist, cdk.out
    - _Requirements: 12.1, 12.2_
  
  - [x] 1.2 Define AWS CDK infrastructure stack
    - Create VPC with 2 AZs and 1 NAT gateway
    - Define RDS PostgreSQL instance (db.t3.medium, Multi-AZ, encrypted)
    - Define DynamoDB table with partition key (game_id) and sort key (occurred_at#event_id)
    - Add DynamoDB GSI for tenant queries (tenant_id, occurred_at#event_id)
    - Define S3 bucket for event archives with lifecycle policies
    - Define Cognito User Pool with custom tenant_id attribute
    - Define Lambda function with VPC access and environment variables
    - Define API Gateway with Cognito authorizer and CORS
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [ ]* 1.3 Write unit tests for CDK stack synthesis
    - Test VPC creation with correct configuration
    - Test RDS instance has encryption and Multi-AZ enabled
    - Test DynamoDB table has TTL and GSI configured
    - _Requirements: 12.12_

- [ ] 2. Implement database schema and migrations
  - [x] 2.1 Create database migration tool setup
    - Install and configure db-migrate or Flyway
    - Create migrations directory structure
    - Add migration scripts to package.json
    - _Requirements: 12.11_
  
  - [x] 2.2 Create initial schema migration (V001)
    - Create tenants table with subscription_tier and max_leagues
    - Create leagues table with tenant_id, sport_type, and branding fields
    - Create seasons table with league_id, date range, and is_active flag
    - Create teams table with league_id and branding fields
    - Create players table with team_id and position fields
    - Create games table with season_id, home/away teams, status, and scores
    - Create standings table with season_id, team_id, and calculated fields
    - Add foreign key constraints with CASCADE deletes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 7.1_
  
  - [x] 2.3 Create indexes migration (V002)
    - Add indexes on all tenant_id columns
    - Add indexes on foreign keys (league_id, season_id, team_id)
    - Add indexes on frequently queried columns (status, scheduled_at, is_active)
    - Add composite index on standings (season_id, points DESC)
    - _Requirements: 9.6_
  
  - [ ]* 2.4 Write integration tests for database schema
    - Test all tables created successfully
    - Test foreign key constraints enforce referential integrity
    - Test indexes exist on expected columns
    - _Requirements: 12.12_

- [ ] 3. Implement core utilities and middleware
  - [x] 3.1 Create database connection pool module
    - Implement PostgreSQL connection pool with pg-pool (min 5, max 20)
    - Add connection reuse across Lambda invocations
    - Add query helper with parameterized query support
    - Add transaction helper for atomic operations
    - _Requirements: 9.4, 10.3_
  
  - [x] 3.2 Create DynamoDB client module
    - Implement DynamoDB client wrapper for event operations
    - Add writeEvent method with TTL calculation (90 days)
    - Add getEventsByGame method with chronological ordering
    - Add getEventsByTenant method using GSI
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  
  - [x] 3.3 Create JWT validation middleware
    - Implement validateJWT function using Cognito public keys
    - Extract tenant_id, user_id, and roles from token claims
    - Handle expired tokens with 401 Unauthorized response
    - Handle invalid signatures with 401 Unauthorized response
    - Cache Cognito public keys for performance
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.2_
  
  - [ ]* 3.4 Write property test for JWT validation
    - **Property 4: JWT Token Validity**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - Generate expired tokens and verify rejection
    - Generate tokens with invalid signatures and verify rejection
    - Generate valid tokens and verify claims extraction
  
  - [x] 3.5 Create multi-tenant isolation middleware
    - Implement enforceMultiTenantIsolation query wrapper
    - Validate tenant_id is present in all queries
    - Verify all results belong to requesting tenant
    - Log security violations to CloudWatch
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 3.6 Write property test for multi-tenant isolation
    - **Property 1: Multi-Tenant Isolation**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Generate data for multiple tenants
    - Verify no cross-tenant data leakage in queries
    - Verify tenant_id filter present in all queries
  
  - [x] 3.7 Create response formatting utilities
    - Implement successResponse helper with request_id and timestamp
    - Implement errorResponse helper with code and message
    - Add UUID generation for request_id
    - Add ISO-8601 timestamp formatting
    - Add CORS headers to all responses
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.9_
  
  - [ ]* 3.8 Write unit tests for response formatting
    - Test success responses include request_id, timestamp, and data
    - Test error responses include request_id, timestamp, and error object
    - Test timestamps are valid ISO-8601 format
    - Test request_id values are valid UUIDs
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4. Checkpoint - Ensure core utilities are functional
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement repository layer for data access
  - [x] 5.1 Create LeagueRepository
    - Implement findByTenantId method with tenant isolation
    - Implement findById method with tenant validation
    - Use parameterized queries for SQL injection prevention
    - _Requirements: 3.1, 3.2, 10.3_
  
  - [x] 5.2 Create SeasonRepository
    - Implement findByLeagueId method with tenant isolation
    - Implement findById method with tenant validation
    - Add query for active seasons (is_active = true)
    - _Requirements: 3.3, 3.4_
  
  - [x] 5.3 Create TeamRepository
    - Implement findByLeagueId method with tenant isolation
    - Implement findById method with tenant validation
    - _Requirements: 4.1, 4.2_
  
  - [x] 5.4 Create PlayerRepository
    - Implement findByTeamId method with tenant isolation
    - Implement findById method with tenant validation
    - _Requirements: 4.3, 4.4_
  
  - [x] 5.5 Create GameRepository
    - Implement findBySeasonId method with optional filters (status, date range, team)
    - Implement findById method with tenant validation
    - Add support for filtering by status (scheduled, live, final, postponed, cancelled)
    - Add support for filtering by date range
    - Add support for filtering by team (home or away)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 5.6 Create StandingsRepository
    - Implement findBySeasonId method with ordering by points DESC
    - Implement upsertStandings method with transaction support
    - Use ON CONFLICT for upsert operations
    - _Requirements: 7.1, 7.9, 7.10_
  
  - [ ]* 5.7 Write unit tests for repositories
    - Test each repository method with valid inputs
    - Test tenant isolation is enforced
    - Test parameterized queries prevent SQL injection
    - Test error handling for database failures
    - _Requirements: 2.1, 10.3_

- [ ] 6. Implement domain services
  - [x] 6.1 Create LeagueService
    - Implement getLeagues method using LeagueRepository
    - Implement getLeagueById method with 404 handling
    - _Requirements: 3.1, 3.2, 14.1, 14.2_
  
  - [x] 6.2 Create SeasonService
    - Implement getSeasonsByLeague method using SeasonRepository
    - Implement getSeasonById method with 404 handling
    - _Requirements: 3.3, 3.4, 14.3, 14.4_
  
  - [x] 6.3 Create TeamService
    - Implement getTeamsByLeague method using TeamRepository
    - Implement getTeamById method with 404 handling
    - _Requirements: 4.1, 4.2, 14.5, 14.6_
  
  - [x] 6.4 Create PlayerService
    - Implement getPlayersByTeam method using PlayerRepository
    - Implement getPlayerById method with 404 handling
    - _Requirements: 4.3, 4.4, 14.7, 14.8_
  
  - [x] 6.5 Create GameService
    - Implement getGamesBySeason method with filter support
    - Implement getGameById method with 404 handling
    - _Requirements: 5.1, 5.2, 14.9, 14.10_
  
  - [ ]* 6.6 Write unit tests for domain services
    - Test each service method returns correct data
    - Test 404 errors for non-existent resources
    - Test tenant isolation is maintained
    - _Requirements: 2.1, 8.7_

- [ ] 7. Implement event sourcing and standings calculation
  - [x] 7.1 Create event validation module
    - Implement validateEventPayload function with schema validation per event_type
    - Add schemas for GAME_STARTED, GOAL_SCORED, PENALTY_ASSESSED, PERIOD_ENDED, GAME_FINALIZED, GAME_CANCELLED, SCORE_CORRECTED
    - Validate required fields and data types using ajv
    - Return 400 Bad Request with field-specific errors for invalid payloads
    - _Requirements: 6.1, 6.6, 8.6, 10.5_
  
  - [x] 7.2 Create EventService for event operations
    - Implement getEventsByGame method using DynamoDB client
    - Implement createEvent method with validation and persistence
    - Validate game exists and belongs to tenant before creating event
    - Prevent event creation for finalized games (status = 'final')
    - Write event to DynamoDB with TTL
    - Apply event to game state in RDS
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 14.11, 14.12_
  
  - [x] 7.3 Implement applyEventToGame function
    - Handle GOAL_SCORED: increment appropriate team score
    - Handle GAME_STARTED: set status to 'live'
    - Handle GAME_FINALIZED: set status to 'final'
    - Handle GAME_CANCELLED: set status to 'cancelled'
    - Use database transactions for atomic updates
    - _Requirements: 6.7, 6.8_
  
  - [x] 7.4 Implement standings calculation algorithm
    - Create calculateStreak helper function
    - Implement recalculateStandings function
    - Fetch all finalized games for season
    - Initialize standings map for all teams
    - Process each game to update wins, losses, ties, points, goals
    - Calculate goal differential (goals_for - goals_against)
    - Calculate streaks based on recent game results
    - Persist standings to database using transaction
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10_
  
  - [ ]* 7.5 Write property test for standings calculation
    - **Property 3: Standings Consistency**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.6, 7.7**
    - Generate random game results
    - Verify games_played = wins + losses + ties
    - Verify points = (wins × 3) + (ties × 1)
    - Verify goal_differential = goals_for - goals_against
  
  - [x] 7.6 Integrate standings recalculation with event creation
    - Trigger recalculateStandings when GAME_FINALIZED event is created
    - Extract season_id from game
    - Call recalculateStandings with tenant_id and season_id
    - _Requirements: 7.1, 7.9_
  
  - [x] 7.7 Create StandingsService
    - Implement getStandingsBySeason method using StandingsRepository
    - Return standings ordered by points DESC
    - _Requirements: 7.9, 14.13_
  
  - [ ]* 7.8 Write integration tests for event sourcing flow
    - Create game in RDS
    - Submit GOAL_SCORED event
    - Verify event persisted to DynamoDB
    - Verify game score updated in RDS
    - Submit GAME_FINALIZED event
    - Verify standings recalculated correctly
    - _Requirements: 6.2, 6.7, 6.8, 7.1_

- [x] 8. Checkpoint - Ensure event sourcing and standings work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement API Gateway handler and routing
  - [x] 9.1 Create main Lambda handler entry point
    - Implement handler function accepting APIGatewayProxyEvent
    - Extract and validate JWT token from Authorization header
    - Route requests to appropriate service based on HTTP method and path
    - Handle errors and format responses
    - Log all requests to CloudWatch with request_id, tenant_id, user_id
    - _Requirements: 8.1, 8.2, 11.1_
  
  - [x] 9.2 Implement route handlers for leagues
    - GET /v1/leagues → LeagueService.getLeagues
    - GET /v1/leagues/{leagueId} → LeagueService.getLeagueById
    - GET /v1/leagues/{leagueId}/seasons → SeasonService.getSeasonsByLeague
    - _Requirements: 14.1, 14.2, 14.3_
  
  - [x] 9.3 Implement route handlers for seasons
    - GET /v1/seasons/{seasonId} → SeasonService.getSeasonById
    - GET /v1/seasons/{seasonId}/games → GameService.getGamesBySeason
    - GET /v1/seasons/{seasonId}/standings → StandingsService.getStandingsBySeason
    - _Requirements: 14.4, 14.9, 14.13_
  
  - [x] 9.4 Implement route handlers for teams
    - GET /v1/leagues/{leagueId}/teams → TeamService.getTeamsByLeague
    - GET /v1/teams/{teamId} → TeamService.getTeamById
    - GET /v1/teams/{teamId}/players → PlayerService.getPlayersByTeam
    - _Requirements: 14.5, 14.6, 14.7_
  
  - [x] 9.5 Implement route handlers for players
    - GET /v1/players/{playerId} → PlayerService.getPlayerById
    - _Requirements: 14.8_
  
  - [x] 9.6 Implement route handlers for games
    - GET /v1/games/{gameId} → GameService.getGameById
    - GET /v1/games/{gameId}/events → EventService.getEventsByGame
    - POST /v1/games/{gameId}/events → EventService.createEvent (scorekeeper role required)
    - _Requirements: 14.10, 14.11, 14.12_
  
  - [x] 9.7 Implement role-based authorization checks
    - Check user roles from JWT claims
    - Enforce scorekeeper role for POST /v1/games/{gameId}/events
    - Return 403 Forbidden for unauthorized actions
    - _Requirements: 1.7, 1.8, 1.9_
  
  - [ ]* 9.8 Write integration tests for API endpoints
    - Test each GET endpoint returns correct data
    - Test POST endpoint creates events successfully
    - Test 401 for missing/invalid JWT tokens
    - Test 403 for unauthorized role access
    - Test 404 for non-existent resources
    - _Requirements: 1.2, 1.3, 1.4, 8.7, 14.1-14.13_

- [ ] 10. Implement error handling and logging
  - [x] 10.1 Create error handling middleware
    - Catch and format database connection errors (503 Service Unavailable)
    - Catch and format validation errors (400 Bad Request)
    - Catch and format not found errors (404 Not Found)
    - Catch and format authorization errors (403 Forbidden)
    - Catch and format generic errors (500 Internal Server Error)
    - _Requirements: 8.5, 8.6, 8.7, 8.8_
  
  - [x] 10.2 Implement structured logging
    - Log all API requests with method, path, tenant_id, user_id, timestamp
    - Log authentication attempts (success and failure)
    - Log authorization failures with attempted action and resource
    - Log database errors with sanitized query and error message
    - Log security violations with violation type and context
    - Exclude PII from logs (player names, emails)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 10.11_
  
  - [ ]* 10.3 Write unit tests for error handling
    - Test each error type returns correct status code and format
    - Test error responses include request_id and timestamp
    - Test PII is excluded from logs
    - _Requirements: 8.5, 8.6, 8.7, 10.11_

- [ ] 11. Implement monitoring and observability
  - [x] 11.1 Create CloudWatch alarms in CDK stack
    - Add alarm for Lambda error rate (threshold: 10 errors in 2 periods)
    - Add alarm for Lambda duration (threshold: 3000ms in 3 periods)
    - Add alarm for RDS connection count (threshold: 80 connections in 2 periods)
    - Add alarm for API Gateway 5xx errors
    - _Requirements: 12.8, 12.9, 12.10_
  
  - [x] 11.2 Add custom CloudWatch metrics
    - Emit metric for standings calculation duration
    - Emit metric for event write latency
    - Emit metric for cross-tenant access attempts
    - _Requirements: 9.1, 9.2, 9.3, 2.4_
  
  - [ ]* 11.3 Write integration tests for monitoring
    - Test CloudWatch alarms are created
    - Test custom metrics are emitted
    - _Requirements: 12.8, 12.9, 12.10_

- [ ] 12. Implement CI/CD pipeline
  - [x] 12.1 Create GitHub Actions workflow
    - Add test job running unit tests and integration tests
    - Add build job compiling TypeScript to JavaScript
    - Add deploy job using AWS CDK
    - Configure AWS credentials from GitHub secrets
    - _Requirements: 12.12_
  
  - [x] 12.2 Add deployment scripts to package.json
    - Add script for running database migrations
    - Add script for CDK synthesis
    - Add script for CDK deployment
    - Add script for running all tests
    - _Requirements: 12.11, 12.12_
  
  - [ ]* 12.3 Test CI/CD pipeline
    - Verify tests run successfully in CI
    - Verify build produces deployable artifacts
    - Verify deployment succeeds to staging environment
    - _Requirements: 12.12_

- [ ] 13. Implement security hardening
  - [x] 13.1 Add input validation at API Gateway
    - Configure JSON schema validation for request bodies
    - Add UUID format validation for path parameters
    - Add date/time format validation for query parameters
    - Add string length limits to prevent DoS
    - _Requirements: 10.4, 10.5, 10.6_
  
  - [x] 13.2 Configure encryption and secrets management
    - Verify RDS encryption at rest is enabled
    - Verify DynamoDB encryption at rest is enabled
    - Verify S3 encryption at rest is enabled
    - Store database credentials in AWS Secrets Manager
    - Grant Lambda permission to read secrets
    - _Requirements: 10.7, 10.8, 10.9, 10.10_
  
  - [x] 13.3 Configure VPC and network security
    - Place Lambda in VPC with private subnets
    - Configure security groups for RDS (allow Lambda access only)
    - Use VPC endpoints for AWS service communication
    - _Requirements: 12.3_
  
  - [ ]* 13.4 Write security tests
    - Test SQL injection attempts are blocked
    - Test cross-tenant access attempts are logged and blocked
    - Test invalid input is rejected at API Gateway
    - _Requirements: 10.3, 10.4, 2.3, 2.4_

- [ ] 14. Implement disaster recovery and backup
  - [x] 14.1 Configure automated backups in CDK stack
    - Enable automated daily backups for RDS (7-day retention)
    - Enable point-in-time recovery for DynamoDB (35-day retention)
    - Enable versioning for S3 event archive bucket
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  
  - [x] 14.2 Create backup and restore documentation
    - Document RDS snapshot restoration procedure
    - Document DynamoDB point-in-time recovery procedure
    - Document event replay from S3 archive procedure
    - Document RTO/RPO targets (4 hours / 1 hour)
    - _Requirements: 13.5, 13.6, 13.7, 13.8, 13.9_
  
  - [ ]* 14.3 Test backup and restore procedures
    - Test RDS snapshot creation and restoration
    - Test DynamoDB point-in-time recovery
    - Test event replay from S3 archive
    - _Requirements: 13.5, 13.6_

- [ ] 15. Implement cost optimization
  - [x] 15.1 Configure cost-optimized resource settings
    - Use Lambda provisioned concurrency only in production (5 instances)
    - Configure DynamoDB on-demand billing mode
    - Add S3 lifecycle policy to transition to Glacier after 365 days
    - Configure CloudWatch Logs retention to 30 days
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
  
  - [x] 15.2 Add cost monitoring and tagging
    - Tag all resources with environment and feature tags
    - Create cost allocation report in CDK stack
    - Add CloudWatch dashboard for cost metrics
    - _Requirements: 15.8, 15.9_
  
  - [ ]* 15.3 Review and optimize costs
    - Monitor Lambda memory usage and right-size
    - Monitor RDS instance utilization and right-size
    - Review DynamoDB capacity usage
    - _Requirements: 15.7, 15.10_

- [ ] 16. Final checkpoint and deployment
  - [x] 16.1 Run complete test suite
    - Run all unit tests
    - Run all property-based tests
    - Run all integration tests
    - Verify 90% code coverage for business logic
    - _Requirements: 12.12_
  
  - [x] 16.2 Deploy to staging environment
    - Run database migrations
    - Deploy CDK stack to staging
    - Verify all endpoints are accessible
    - Verify monitoring and alarms are active
    - _Requirements: 12.1, 12.11_
  
  - [x] 16.3 Perform smoke tests in staging
    - Test authentication flow with Cognito
    - Test creating and retrieving leagues, teams, players
    - Test creating games and events
    - Test standings calculation
    - Test error handling and logging
    - _Requirements: 1.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 11.1_
  
  - [x] 16.4 Final checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Frontend integration and API documentation
  - [x] 17.1 Generate OpenAPI/Swagger specification
    - Create OpenAPI 3.0 specification document for all API endpoints
    - Include request/response schemas with examples
    - Document authentication requirements (JWT Bearer token)
    - Document error response formats and status codes
    - Include rate limiting and pagination details
    - Export specification as JSON and YAML formats
    - _Requirements: 14.1-14.13, 8.1, 8.2_
  
  - [ ] 17.2 Set up API documentation hosting
    - Deploy Swagger UI or ReDoc for interactive API documentation
    - Host documentation at /api-docs endpoint or separate subdomain
    - Include "Try it out" functionality for testing endpoints
    - Add authentication flow examples with Cognito
    - Document multi-tenant isolation behavior
    - _Requirements: 14.1-14.13_
  
  - [ ] 17.3 Create iOS integration guide
    - Document API base URL and versioning strategy
    - Provide Cognito User Pool configuration details (pool ID, client ID, region)
    - Document JWT token format and required claims (tenant_id, user_id, roles)
    - Provide example Swift code for authentication flow
    - Document API response envelope format (request_id, timestamp, data)
    - Document error handling patterns and retry strategies
    - Include rate limiting guidance (1000 req/sec per tenant)
    - _Requirements: 1.1, 1.2, 8.1, 8.2, 9.9_
  
  - [ ] 17.4 Update iOS ScoreBaseAPIClient with backend endpoints
    - Update base URL configuration in core-networking package
    - Implement authentication with Cognito JWT tokens
    - Update DTOs to match backend response formats
    - Implement request_id tracking for debugging
    - Add error mapping from backend error codes to iOS errors
    - Update caching strategy to work with backend response format
    - _Requirements: 8.1, 8.2, 8.9_
  
  - [ ] 17.5 Implement end-to-end integration tests
    - Test iOS app authentication flow with deployed Cognito
    - Test fetching leagues, seasons, teams, players from backend
    - Test creating games and submitting events from iOS app
    - Test fetching standings and verifying calculations
    - Test error handling for 401, 403, 404, 429, 500 responses
    - Test offline behavior and request retry logic
    - Verify multi-tenant isolation (no cross-tenant data visible)
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.5-8.8_
  
  - [ ] 17.6 Create API contract tests
    - Implement contract tests using Pact or similar framework
    - Define consumer contracts from iOS app perspective
    - Verify backend responses match iOS app expectations
    - Test backward compatibility when API evolves
    - Run contract tests in CI/CD pipeline
    - _Requirements: 14.1-14.13_
  
  - [ ] 17.7 Document API versioning and deprecation policy
    - Define API versioning strategy (URL path versioning: /v1/, /v2/)
    - Document breaking vs non-breaking changes
    - Define deprecation timeline (minimum 6 months notice)
    - Create process for communicating API changes to iOS team
    - Document backward compatibility guarantees
    - _Requirements: 8.1, 8.2_
  
  - [ ] 17.8 Set up shared API monitoring dashboard
    - Create CloudWatch dashboard visible to iOS team
    - Include API latency metrics (p50, p95, p99)
    - Include error rate metrics by endpoint
    - Include authentication failure metrics
    - Include rate limiting metrics
    - Add alerts for iOS team when API issues detected
    - _Requirements: 9.1, 11.1_
  
  - [ ] 17.9 Coordinate iOS app deployment with backend
    - Verify iOS app works with staging backend
    - Test authentication flow end-to-end
    - Verify all features work with real backend data
    - Test error scenarios (network failures, invalid tokens, rate limits)
    - Perform load testing with iOS app traffic patterns
    - Document rollback procedures if integration issues arise
    - _Requirements: 1.1, 9.1, 14.1-14.13_
  
  - [ ]* 17.10 Create API client SDK for iOS (optional)
    - Generate Swift API client from OpenAPI specification
    - Package as Swift Package Manager module
    - Include type-safe request/response models
    - Include authentication handling
    - Include error handling and retry logic
    - Publish to internal package repository
    - _Requirements: 14.1-14.13_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows with real AWS services
- The implementation uses TypeScript/Node.js as specified in the design document
- All infrastructure is defined using AWS CDK for infrastructure as code
- Multi-tenant isolation is enforced at every layer (JWT, queries, results)
- Event sourcing provides immutable audit trail and enables event replay
- Standings are automatically recalculated when games are finalized
