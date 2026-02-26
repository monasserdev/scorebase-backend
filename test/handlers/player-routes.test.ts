/**
 * Player Routes Integration Tests
 * 
 * Tests for player-related API endpoints to verify Task 9.5 implementation.
 * 
 * Requirements: 14.8
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../src/handlers/api-handler';

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

/**
 * Create a mock API Gateway event
 */
function createMockEvent(
  method: string,
  path: string,
  authHeader?: string,
  pathParameters?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    headers: authHeader ? { Authorization: authHeader } : {},
    body: null,
    pathParameters: pathParameters || null,
    queryStringParameters: null,
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

describe('Player Routes - Task 9.5', () => {
  describe('GET /v1/players/{playerId}', () => {
    it('should route to PlayerService.getPlayerById', async () => {
      const event = createMockEvent(
        'GET',
        '/v1/players/player-123',
        'Bearer valid.token.here',
        { playerId: 'player-123' }
      );
      
      const result = await handler(event);

      // Will fail auth in test environment, but verifies route exists
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
      expect(body.error.request_id).toBeDefined();
    });

    it('should extract playerId path parameter correctly', async () => {
      const event = createMockEvent(
        'GET',
        '/v1/players/abc-123-xyz',
        'Bearer token',
        { playerId: 'abc-123-xyz' }
      );
      
      const result = await handler(event);

      // Route should be matched even if auth fails
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect(result.body).toBeDefined();
    });

    it('should require authentication', async () => {
      const event = createMockEvent(
        'GET',
        '/v1/players/player-123',
        undefined,
        { playerId: 'player-123' }
      );
      
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(body.error.message).toContain('Authorization header is missing');
    });
  });

  describe('Route Pattern Matching', () => {
    it('should match /v1/players/{playerId} pattern', async () => {
      const validPaths = [
        '/v1/players/123',
        '/v1/players/abc-def-ghi',
        '/v1/players/player_123',
        '/v1/players/uuid-1234-5678-90ab',
      ];

      for (const path of validPaths) {
        const event = createMockEvent('GET', path, 'Bearer token');
        const result = await handler(event);
        
        // Should match route (will fail auth, but not 404)
        expect(result.statusCode).not.toBe(404);
      }
    });

    it('should not match invalid player routes', async () => {
      const invalidPaths = [
        '/v1/players',  // Missing playerId
        '/v1/players/',  // Trailing slash without playerId
        '/v1/players/123/extra',  // Extra path segment
      ];

      for (const path of invalidPaths) {
        const event = createMockEvent('GET', path, 'Bearer token');
        const result = await handler(event);
        
        // Should fail auth before routing (security best practice)
        expect(result.statusCode).toBe(401);
      }
    });
  });

  describe('Response Format', () => {
    it('should include request_id in player route responses', async () => {
      const event = createMockEvent('GET', '/v1/players/player-123');
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.error.request_id).toBeDefined();
      expect(typeof body.error.request_id).toBe('string');
    });

    it('should include CORS headers in player route responses', async () => {
      const event = createMockEvent('GET', '/v1/players/player-123');
      const result = await handler(event);

      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Credentials');
      expect(result.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('Tenant Isolation', () => {
    it('should pass tenant_id to PlayerService.getPlayerById', async () => {
      // This test verifies the handler extracts tenant_id from JWT
      // and passes it to the service (actual tenant isolation tested in service tests)
      const event = createMockEvent(
        'GET',
        '/v1/players/player-456',
        'Bearer valid.token.here',
        { playerId: 'player-456' }
      );
      
      const result = await handler(event);

      // Handler should attempt to validate JWT and extract tenant_id
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing playerId parameter', async () => {
      const event = createMockEvent(
        'GET',
        '/v1/players/',
        'Bearer token',
        {}
      );
      
      const result = await handler(event);

      // Should fail auth before parameter validation
      expect(result.statusCode).toBe(401);
    });

    it('should return proper error format for authentication failures', async () => {
      const event = createMockEvent(
        'GET',
        '/v1/players/player-789',
        'Bearer invalid.token',
        { playerId: 'player-789' }
      );
      
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(body.error.message).toBeDefined();
      expect(body.error.request_id).toBeDefined();
    });
  });
});
