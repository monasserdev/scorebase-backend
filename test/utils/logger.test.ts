/**
 * Tests for Structured Logging Module
 * 
 * Validates structured logging functions, PII sanitization,
 * and log format consistency.
 */

import {
  logRequest,
  logAuthentication,
  logAuthorization,
  logDatabase,
  logSecurity,
  log,
  LogLevel,
} from '../../src/utils/logger';

describe('Structured Logging Module', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore mocks
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('logRequest', () => {
    it('should log successful API request with all required fields', () => {
      logRequest({
        requestId: 'req-123',
        method: 'GET',
        path: '/v1/leagues',
        tenantId: 'tenant-456',
        userId: 'user-789',
        statusCode: 200,
        latencyMs: 45,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('API_REQUEST');
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.request_id).toBe('req-123');
      expect(logEntry.method).toBe('GET');
      expect(logEntry.path).toBe('/v1/leagues');
      expect(logEntry.tenant_id).toBe('tenant-456');
      expect(logEntry.user_id).toBe('user-789');
      expect(logEntry.status_code).toBe(200);
      expect(logEntry.latency_ms).toBe(45);
      expect(logEntry.timestamp).toBeDefined();
    });

    it('should log 4xx errors with WARN level', () => {
      logRequest({
        requestId: 'req-123',
        method: 'GET',
        path: '/v1/leagues/invalid',
        tenantId: 'tenant-456',
        userId: 'user-789',
        statusCode: 404,
        latencyMs: 10,
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.status_code).toBe(404);
    });

    it('should log 5xx errors with ERROR level', () => {
      logRequest({
        requestId: 'req-123',
        method: 'POST',
        path: '/v1/games/123/events',
        tenantId: 'tenant-456',
        userId: 'user-789',
        statusCode: 500,
        latencyMs: 100,
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.status_code).toBe(500);
    });

    it('should include valid ISO-8601 timestamp', () => {
      logRequest({
        requestId: 'req-123',
        method: 'GET',
        path: '/v1/leagues',
        tenantId: 'tenant-456',
        userId: 'user-789',
        statusCode: 200,
        latencyMs: 45,
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const timestamp = new Date(logEntry.timestamp);
      
      expect(timestamp.toISOString()).toBe(logEntry.timestamp);
    });
  });

  describe('logAuthentication', () => {
    it('should log successful authentication', () => {
      logAuthentication({
        requestId: 'req-123',
        success: true,
        tenantId: 'tenant-456',
        userId: 'user-789',
        username: 'john.doe',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('AUTHENTICATION');
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.success).toBe(true);
      expect(logEntry.tenant_id).toBe('tenant-456');
      expect(logEntry.user_id).toBe('user-789');
      expect(logEntry.username).toBe('john.doe');
      expect(logEntry.reason).toBeUndefined();
    });

    it('should log failed authentication with reason', () => {
      logAuthentication({
        requestId: 'req-123',
        success: false,
        reason: 'Token expired',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('AUTHENTICATION');
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.success).toBe(false);
      expect(logEntry.reason).toBe('Token expired');
      expect(logEntry.tenant_id).toBeUndefined();
      expect(logEntry.user_id).toBeUndefined();
    });

    it('should log failed authentication for invalid signature', () => {
      logAuthentication({
        requestId: 'req-456',
        success: false,
        reason: 'Invalid token signature',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.success).toBe(false);
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.reason).toBe('Invalid token signature');
    });
  });

  describe('logAuthorization', () => {
    it('should log successful authorization', () => {
      logAuthorization({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        success: true,
        action: 'POST /v1/games/{gameId}/events',
        resource: 'game-123',
        requiredRole: 'scorekeeper',
        userRoles: ['scorekeeper', 'admin'],
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('AUTHORIZATION');
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.success).toBe(true);
      expect(logEntry.action).toBe('POST /v1/games/{gameId}/events');
      expect(logEntry.resource).toBe('game-123');
      expect(logEntry.required_role).toBe('scorekeeper');
      expect(logEntry.user_roles).toEqual(['scorekeeper', 'admin']);
    });

    it('should log failed authorization with attempted action and resource', () => {
      logAuthorization({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        success: false,
        action: 'POST /v1/games/{gameId}/events',
        resource: 'game-123',
        requiredRole: 'scorekeeper',
        userRoles: ['viewer'],
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('AUTHORIZATION');
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.success).toBe(false);
      expect(logEntry.action).toBe('POST /v1/games/{gameId}/events');
      expect(logEntry.resource).toBe('game-123');
      expect(logEntry.required_role).toBe('scorekeeper');
      expect(logEntry.user_roles).toEqual(['viewer']);
    });
  });

  describe('logDatabase', () => {
    it('should log database error with sanitized query', () => {
      logDatabase({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        errorMessage: 'Connection timeout',
        query: 'SELECT * FROM games WHERE tenant_id = $1 AND game_id = $2',
        operation: 'SELECT',
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('DATABASE_ERROR');
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.error_message).toBe('Connection timeout');
      expect(logEntry.query_preview).toBe('SELECT * FROM games WHERE tenant_id = $1 AND game_id = $2');
      expect(logEntry.operation).toBe('SELECT');
    });

    it('should truncate long queries to 200 characters', () => {
      const longQuery = 'SELECT * FROM games WHERE ' + 'a = 1 AND '.repeat(50) + 'tenant_id = $1';
      
      logDatabase({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        errorMessage: 'Query failed',
        query: longQuery,
        operation: 'SELECT',
      });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.query_preview.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(logEntry.query_preview.endsWith('...')).toBe(true);
    });

    it('should sanitize email addresses in queries', () => {
      logDatabase({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        errorMessage: 'Query failed',
        query: "SELECT * FROM players WHERE email = 'john.doe@example.com'",
        operation: 'SELECT',
      });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.query_preview).not.toContain('john.doe@example.com');
      expect(logEntry.query_preview).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('logSecurity', () => {
    it('should log security violation with context', () => {
      logSecurity({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        violationType: 'CROSS_TENANT_ACCESS_ATTEMPT',
        severity: 'HIGH',
        context: {
          attempted_tenant_id: 'tenant-999',
          resource: 'league-123',
          action: 'GET',
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.log_type).toBe('SECURITY_VIOLATION');
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.violation_type).toBe('CROSS_TENANT_ACCESS_ATTEMPT');
      expect(logEntry.severity).toBe('HIGH');
      expect(logEntry.context.attempted_tenant_id).toBe('tenant-999');
      expect(logEntry.context.resource).toBe('league-123');
    });

    it('should sanitize PII from context', () => {
      logSecurity({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        violationType: 'UNAUTHORIZED_DATA_ACCESS',
        severity: 'CRITICAL',
        context: {
          player_name: 'John Doe',
          email: 'john.doe@example.com',
          team_id: 'team-123',
        },
      });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.context.player_name).toBe('[PII_REDACTED]');
      expect(logEntry.context.email).toBe('[PII_REDACTED]');
      expect(logEntry.context.team_id).toBe('team-123');
    });

    it('should handle nested objects in context', () => {
      logSecurity({
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        violationType: 'DATA_BREACH_ATTEMPT',
        severity: 'CRITICAL',
        context: {
          user: {
            first_name: 'John',
            last_name: 'Doe',
            user_id: 'user-123',
          },
          resource: 'game-456',
        },
      });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.context.user.first_name).toBe('[PII_REDACTED]');
      expect(logEntry.context.user.last_name).toBe('[PII_REDACTED]');
      expect(logEntry.context.user.user_id).toBe('user-123');
      expect(logEntry.context.resource).toBe('game-456');
    });
  });

  describe('log (generic)', () => {
    it('should log INFO level message with context', () => {
      log(LogLevel.INFO, 'Standings recalculated', {
        request_id: 'req-123',
        tenant_id: 'tenant-456',
        season_id: 'season-789',
        duration_ms: 150,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('Standings recalculated');
      expect(logEntry.request_id).toBe('req-123');
      expect(logEntry.tenant_id).toBe('tenant-456');
      expect(logEntry.season_id).toBe('season-789');
      expect(logEntry.duration_ms).toBe(150);
    });

    it('should log ERROR level message', () => {
      log(LogLevel.ERROR, 'Unexpected error occurred', {
        error_code: 'UNKNOWN_ERROR',
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('Unexpected error occurred');
    });

    it('should sanitize PII from context', () => {
      log(LogLevel.INFO, 'User action', {
        user_id: 'user-123',
        email: 'user@example.com',
        action: 'create_game',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.user_id).toBe('user-123');
      expect(logEntry.email).toBe('[PII_REDACTED]');
      expect(logEntry.action).toBe('create_game');
    });
  });

  describe('PII Sanitization', () => {
    it('should redact email addresses', () => {
      log(LogLevel.INFO, 'Test message', {
        description: 'Contact john.doe@example.com for details',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.description).not.toContain('john.doe@example.com');
      expect(logEntry.description).toContain('[EMAIL_REDACTED]');
    });

    it('should redact phone numbers', () => {
      log(LogLevel.INFO, 'Test message', {
        description: 'Call 555-123-4567 for support',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.description).not.toContain('555-123-4567');
      expect(logEntry.description).toContain('[PHONE_REDACTED]');
    });

    it('should redact SSN', () => {
      log(LogLevel.INFO, 'Test message', {
        description: 'SSN: 123-45-6789',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.description).not.toContain('123-45-6789');
      expect(logEntry.description).toContain('[SSN_REDACTED]');
    });

    it('should redact PII fields in objects', () => {
      log(LogLevel.INFO, 'Test message', {
        player: {
          player_name: 'John Doe',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone_number: '555-1234',
          team_id: 'team-123',
        },
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.player.player_name).toBe('[PII_REDACTED]');
      expect(logEntry.player.first_name).toBe('[PII_REDACTED]');
      expect(logEntry.player.last_name).toBe('[PII_REDACTED]');
      expect(logEntry.player.email).toBe('[PII_REDACTED]');
      expect(logEntry.player.phone_number).toBe('[PII_REDACTED]');
      expect(logEntry.player.team_id).toBe('team-123');
    });

    it('should handle arrays with PII', () => {
      log(LogLevel.INFO, 'Test message', {
        players: [
          { player_name: 'John Doe', player_id: 'player-1' },
          { player_name: 'Jane Smith', player_id: 'player-2' },
        ],
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.players[0].player_name).toBe('[PII_REDACTED]');
      expect(logEntry.players[0].player_id).toBe('player-1');
      expect(logEntry.players[1].player_name).toBe('[PII_REDACTED]');
      expect(logEntry.players[1].player_id).toBe('player-2');
    });
  });

  describe('Log Format Consistency', () => {
    it('should include timestamp in all log entries', () => {
      logRequest({
        requestId: 'req-1',
        method: 'GET',
        path: '/v1/leagues',
        tenantId: 'tenant-1',
        userId: 'user-1',
        statusCode: 200,
        latencyMs: 10,
      });

      logAuthentication({
        requestId: 'req-2',
        success: true,
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      logAuthorization({
        requestId: 'req-3',
        tenantId: 'tenant-1',
        userId: 'user-1',
        success: true,
        action: 'GET',
        resource: 'league-1',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(3);

      for (let i = 0; i < 3; i++) {
        const logEntry = JSON.parse(consoleLogSpy.mock.calls[i][0]);
        expect(logEntry.timestamp).toBeDefined();
        expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
      }
    });

    it('should include level in all log entries', () => {
      logRequest({
        requestId: 'req-1',
        method: 'GET',
        path: '/v1/leagues',
        tenantId: 'tenant-1',
        userId: 'user-1',
        statusCode: 200,
        latencyMs: 10,
      });

      logDatabase({
        requestId: 'req-2',
        tenantId: 'tenant-1',
        errorMessage: 'Error',
        query: 'SELECT * FROM games',
        operation: 'SELECT',
      });

      const requestLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const dbLog = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(requestLog.level).toBeDefined();
      expect(dbLog.level).toBeDefined();
    });
  });
});
