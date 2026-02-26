/**
 * Game Routes Tests
 * 
 * Tests for game-related API endpoints:
 * - GET /v1/games/{gameId}
 * - GET /v1/games/{gameId}/events
 * - POST /v1/games/{gameId}/events (scorekeeper role required)
 * 
 * Requirements: 14.10, 14.11, 14.12
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/api-handler';
import { GameRepository } from '../../src/repositories/game-repository';
import { GameStatus } from '../../src/models/game';
import { EventType } from '../../src/models/event';

// Mock environment variables
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'scorebase_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test';
process.env.DYNAMODB_TABLE_NAME = 'scorebase-events-test';
process.env.S3_ARCHIVE_BUCKET = 'scorebase-events-archive-test';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_test123';
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';

// Mock JWT validation
jest.mock('../../src/middleware/jwt-validation', () => ({
  validateJWT: jest.fn().mockResolvedValue({
    tenant_id: 'tenant-123',
    user_id: 'user-456',
    roles: ['scorekeeper'],
  }),
}));

// Mock GameRepository
jest.mock('../../src/repositories/game-repository');
jest.mock('../../src/repositories/season-repository');
jest.mock('../../src/repositories/team-repository');
jest.mock('../../src/repositories/standings-repository');

// Mock DynamoDB functions
jest.mock('../../src/config/dynamodb', () => ({
  writeEvent: jest.fn(),
  getEventsByGame: jest.fn(),
}));

// Mock event utilities
jest.mock('../../src/utils/event-validation', () => ({
  validateEventPayload: jest.fn(),
}));

jest.mock('../../src/utils/apply-event-to-game', () => ({
  applyEventToGame: jest.fn(),
}));

jest.mock('../../src/utils/standings-calculation', () => ({
  recalculateStandings: jest.fn(),
}));

/**
 * Create a mock API Gateway event
 */
function createMockEvent(
  method: string,
  path: string,
  authHeader: string = 'Bearer valid.token.here',
  body?: any,
  pathParameters?: Record<string, string>,
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    headers: { Authorization: authHeader },
    body: body ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
    queryStringParameters: queryStringParameters || null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: method,
      path,
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: path,
      identity: {
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        user: null,
        userArn: null,
      },
      authorizer: null,
    },
    resource: path,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe('Game Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/games/{gameId}', () => {
    it('should return game by ID', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);

      const event = createMockEvent(
        'GET',
        '/v1/games/game-123',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const body = JSON.parse(result.body);
      expect(body.data.game).toEqual(mockGame);
      expect(body.request_id).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('should return 404 for non-existent game', async () => {
      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent(
        'GET',
        '/v1/games/nonexistent',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'nonexistent' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Game not found');
    });

    it('should enforce tenant isolation', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);

      const event = createMockEvent(
        'GET',
        '/v1/games/game-123',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'game-123' }
      );

      await handler(event);

      // Verify tenant_id was passed to repository
      expect(GameRepository.prototype.findById).toHaveBeenCalledWith('tenant-123', 'game-123');
    });
  });

  describe('GET /v1/games/{gameId}/events', () => {
    it('should return events for a game', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.LIVE,
        home_score: 2,
        away_score: 1,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T19:30:00Z',
      };

      const mockEvents = [
        {
          event_id: 'event-1',
          game_id: 'game-123',
          tenant_id: 'tenant-123',
          event_type: EventType.GAME_STARTED,
          event_version: '1.0',
          occurred_at: '2024-01-15T19:00:00Z',
          payload: {},
          metadata: { user_id: 'user-456', source: 'api' },
          ttl: 1234567890,
        },
        {
          event_id: 'event-2',
          game_id: 'game-123',
          tenant_id: 'tenant-123',
          event_type: EventType.GOAL_SCORED,
          event_version: '1.0',
          occurred_at: '2024-01-15T19:15:00Z',
          payload: { team_id: 'team-1', player_id: 'player-1' },
          metadata: { user_id: 'user-456', source: 'api' },
          ttl: 1234567890,
        },
      ];

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);
      
      const { getEventsByGame } = require('../../src/config/dynamodb');
      getEventsByGame.mockResolvedValue(mockEvents);

      const event = createMockEvent(
        'GET',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const body = JSON.parse(result.body);
      expect(body.data.events).toEqual(mockEvents);
      expect(body.data.events).toHaveLength(2);
      expect(body.request_id).toBeDefined();
    });

    it('should return 404 for non-existent game', async () => {
      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent(
        'GET',
        '/v1/games/nonexistent/events',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'nonexistent' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Game not found');
    });

    it('should return empty array for game with no events', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);
      
      const { getEventsByGame } = require('../../src/config/dynamodb');
      getEventsByGame.mockResolvedValue([]);

      const event = createMockEvent(
        'GET',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        undefined,
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const body = JSON.parse(result.body);
      expect(body.data.events).toEqual([]);
    });
  });

  describe('POST /v1/games/{gameId}/events', () => {
    it('should create event with scorekeeper role', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.LIVE,
        home_score: 0,
        away_score: 0,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T19:00:00Z',
      };

      const mockEvent = {
        event_id: 'event-123',
        game_id: 'game-123',
        tenant_id: 'tenant-123',
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: '2024-01-15T19:15:00Z',
        payload: { team_id: 'team-1', player_id: 'player-1' },
        metadata: { user_id: 'user-456', source: 'api', ip_address: '127.0.0.1' },
        ttl: 1234567890,
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);
      
      const { writeEvent } = require('../../src/config/dynamodb');
      writeEvent.mockResolvedValue(mockEvent);

      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      
      const body = JSON.parse(result.body);
      expect(body.data.event).toEqual(mockEvent);
      expect(body.request_id).toBeDefined();
    });

    it('should return 403 without scorekeeper role', async () => {
      const { validateJWT } = require('../../src/middleware/jwt-validation');
      validateJWT.mockResolvedValueOnce({
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        roles: ['viewer'], // No scorekeeper role
      });

      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTHORIZATION_ERROR');
      expect(body.error.message).toContain('scorekeeper');
    });

    it('should return 400 for missing event_type', async () => {
      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('event_type is required');
    });

    it('should return 400 for missing payload', async () => {
      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
        },
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('payload is required');
    });

    it('should return 404 for non-existent game', async () => {
      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent(
        'POST',
        '/v1/games/nonexistent/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'nonexistent' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Game not found');
    });

    it('should return 400 for finalized game', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.FINAL, // Game is finalized
        home_score: 3,
        away_score: 2,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T21:00:00Z',
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);

      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'game-123' }
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('finalized');
    });

    it('should include metadata in created event', async () => {
      const mockGame = {
        game_id: 'game-123',
        season_id: 'season-456',
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: '2024-01-15T19:00:00Z',
        status: GameStatus.LIVE,
        home_score: 0,
        away_score: 0,
        location: 'Arena 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T19:00:00Z',
      };

      (GameRepository.prototype.findById as jest.Mock).mockResolvedValue(mockGame);
      
      const { writeEvent } = require('../../src/config/dynamodb');
      writeEvent.mockImplementation((params: any) => Promise.resolve({
        event_id: 'event-123',
        ...params,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      }));

      const event = createMockEvent(
        'POST',
        '/v1/games/game-123/events',
        'Bearer valid.token.here',
        {
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
        },
        { gameId: 'game-123' }
      );

      await handler(event);

      // Verify writeEvent was called with correct metadata
      expect(writeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          game_id: 'game-123',
          tenant_id: 'tenant-123',
          event_type: 'GOAL_SCORED',
          payload: { team_id: 'team-1', player_id: 'player-1' },
          metadata: expect.objectContaining({
            user_id: 'user-456',
            source: 'api',
            ip_address: '127.0.0.1',
          }),
        })
      );
    });
  });
});
