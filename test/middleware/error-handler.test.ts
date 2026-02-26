/**
 * Error Handler Middleware Tests
 * 
 * Tests for centralized error handling middleware that formats
 * different error types into standardized API responses.
 * 
 * Requirements: 8.5, 8.6, 8.7, 8.8
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  handleError,
  withErrorHandling,
  isDatabaseConnectionError,
  DatabaseError,
  ValidationError,
  AuthorizationError,
} from '../../src/middleware/error-handler';
import { AuthError, AuthErrorCode } from '../../src/models/auth';
import { NotFoundError, BadRequestError, ForbiddenError, ServiceUnavailableError } from '../../src/models/errors';
import { HttpStatus, ErrorCode } from '../../src/models/response';

describe('Error Handler Middleware', () => {
  let requestId: string;

  beforeEach(() => {
    requestId = 'test-request-id-123';
  });

  describe('handleError', () => {
    describe('Authentication Errors (401)', () => {
      it('should handle AuthError with MISSING_TOKEN', () => {
        const error = new AuthError(AuthErrorCode.MISSING_TOKEN, 'Authorization header is required');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
        expect(body.error.message).toBe('Authorization header is required');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should handle AuthError with EXPIRED_TOKEN', () => {
        const error = new AuthError(AuthErrorCode.EXPIRED_TOKEN, 'Token has expired');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
        expect(body.error.message).toBe('Token has expired');
      });

      it('should handle AuthError with INVALID_SIGNATURE', () => {
        const error = new AuthError(AuthErrorCode.INVALID_SIGNATURE, 'Invalid token signature');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
        expect(body.error.message).toBe('Invalid token signature');
      });
    });

    describe('Authorization Errors (403)', () => {
      it('should handle ForbiddenError', () => {
        const error = new ForbiddenError('Insufficient permissions');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.AUTHORIZATION_ERROR);
        expect(body.error.message).toBe('Insufficient permissions');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should handle AuthorizationError', () => {
        const error = new AuthorizationError('Required role: scorekeeper');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.AUTHORIZATION_ERROR);
        expect(body.error.message).toBe('Required role: scorekeeper');
      });
    });

    describe('Not Found Errors (404)', () => {
      it('should handle NotFoundError for league', () => {
        const error = new NotFoundError('League not found');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
        expect(body.error.message).toBe('League not found');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should handle NotFoundError for team', () => {
        const error = new NotFoundError('Team not found');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Team not found');
      });

      it('should handle NotFoundError for game', () => {
        const error = new NotFoundError('Game not found');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Game not found');
      });
    });

    describe('Validation Errors (400)', () => {
      it('should handle BadRequestError', () => {
        const error = new BadRequestError('Invalid request body');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(body.error.message).toBe('Invalid request body');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should handle ValidationError with field details', () => {
        const details = {
          field: 'event_type',
          error: 'event_type is required',
        };
        const error = new ValidationError('Validation failed', details);
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(body.error.message).toBe('Validation failed');
        expect(body.error.details).toEqual(details);
      });

      it('should handle ValidationError without details', () => {
        const error = new ValidationError('Invalid input');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Invalid input');
        expect(body.error.details).toBeUndefined();
      });

      it('should handle BadRequestError for missing path parameter', () => {
        const error = new BadRequestError('Missing path parameter: leagueId');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Missing path parameter: leagueId');
      });
    });

    describe('Database Connection Errors (503)', () => {
      it('should handle ServiceUnavailableError', () => {
        const error = new ServiceUnavailableError('Database is unavailable');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(body.error.message).toBe('Database is unavailable');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should handle DatabaseError', () => {
        const error = new DatabaseError('Connection pool exhausted');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(body.error.message).toBe('Database connection failed');
      });

      it('should handle ECONNREFUSED error', () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(body.error.message).toBe('Database connection failed');
      });

      it('should handle ETIMEDOUT error', () => {
        const error = new Error('connect ETIMEDOUT');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Database connection failed');
      });

      it('should handle connection terminated error', () => {
        const error = new Error('Connection terminated unexpectedly');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        
        const body = JSON.parse(result.body);
        expect(body.error.message).toBe('Database connection failed');
      });
    });

    describe('Generic Errors (500)', () => {
      it('should handle generic Error', () => {
        const error = new Error('Unexpected error occurred');
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(body.error.message).toBe('Internal server error');
        expect(body.error.request_id).toBe(requestId);
      });

      it('should include error details in development mode', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const error = new Error('Debug error message');
        const result = handleError(error, requestId);

        const body = JSON.parse(result.body);
        expect(body.error.details).toBeDefined();
        expect(body.error.details.error).toBe('Debug error message');

        process.env.NODE_ENV = originalEnv;
      });

      it('should not include error details in production mode', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const error = new Error('Sensitive error message');
        const result = handleError(error, requestId);

        const body = JSON.parse(result.body);
        expect(body.error.details).toBeUndefined();

        process.env.NODE_ENV = originalEnv;
      });

      it('should handle non-Error objects', () => {
        const error = 'String error';
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      });

      it('should handle null error', () => {
        const error = null;
        const result = handleError(error, requestId);

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        
        const body = JSON.parse(result.body);
        expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      });
    });

    describe('Response Format', () => {
      it('should include request_id in all error responses', () => {
        const errors = [
          new AuthError(AuthErrorCode.MISSING_TOKEN, 'Missing token'),
          new ForbiddenError('Forbidden'),
          new NotFoundError('Not found'),
          new BadRequestError('Bad request'),
          new ServiceUnavailableError('Unavailable'),
          new Error('Generic error'),
        ];

        errors.forEach(error => {
          const result = handleError(error, requestId);
          const body = JSON.parse(result.body);
          expect(body.error.request_id).toBe(requestId);
        });
      });

      it('should include CORS headers in all error responses', () => {
        const error = new NotFoundError('Not found');
        const result = handleError(error, requestId);

        expect(result.headers).toBeDefined();
        expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
        expect(result.headers?.['Content-Type']).toBe('application/json');
      });

      it('should return valid JSON in response body', () => {
        const error = new NotFoundError('Not found');
        const result = handleError(error, requestId);

        expect(() => JSON.parse(result.body)).not.toThrow();
        
        const body = JSON.parse(result.body);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBeDefined();
        expect(body.error.message).toBeDefined();
      });
    });
  });

  describe('isDatabaseConnectionError', () => {
    it('should detect ECONNREFUSED errors', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect ETIMEDOUT errors', () => {
      const error = new Error('connect ETIMEDOUT');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect ENOTFOUND errors', () => {
      const error = new Error('getaddrinfo ENOTFOUND database.example.com');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect connection terminated errors', () => {
      const error = new Error('Connection terminated unexpectedly');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect connection refused errors', () => {
      const error = new Error('Connection refused by server');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect connect timeout errors', () => {
      const error = new Error('connect timeout');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should detect DatabaseError instances', () => {
      const error = new DatabaseError('Database error');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });

    it('should not detect non-database errors', () => {
      const errors = [
        new Error('Invalid input'),
        new NotFoundError('Not found'),
        new BadRequestError('Bad request'),
        new Error('Some other error'),
      ];

      errors.forEach(error => {
        expect(isDatabaseConnectionError(error)).toBe(false);
      });
    });

    it('should be case-insensitive', () => {
      const error = new Error('ECONNREFUSED connection failed');
      expect(isDatabaseConnectionError(error)).toBe(true);
    });
  });

  describe('withErrorHandling', () => {
    it('should return result when function succeeds', async () => {
      const fn = async () => ({ data: 'success' });
      const result = await withErrorHandling(fn, requestId);

      expect(result).toEqual({ data: 'success' });
    });

    it('should handle errors and return formatted response', async () => {
      const fn = async () => {
        throw new NotFoundError('Resource not found');
      };
      
      const result = await withErrorHandling(fn, requestId);

      expect(result).toHaveProperty('statusCode', HttpStatus.NOT_FOUND);
      expect(result).toHaveProperty('body');
      
      const body = JSON.parse((result as any).body);
      expect(body.error.message).toBe('Resource not found');
    });

    it('should handle async errors', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new BadRequestError('Validation failed');
      };
      
      const result = await withErrorHandling(fn, requestId);

      expect(result).toHaveProperty('statusCode', HttpStatus.BAD_REQUEST);
    });

    it('should handle database connection errors', async () => {
      const fn = async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      };
      
      const result = await withErrorHandling(fn, requestId);

      expect(result).toHaveProperty('statusCode', HttpStatus.SERVICE_UNAVAILABLE);
      
      const body = JSON.parse((result as any).body);
      expect(body.error.message).toBe('Database connection failed');
    });
  });

  describe('Custom Error Classes', () => {
    describe('DatabaseError', () => {
      it('should create DatabaseError with message', () => {
        const error = new DatabaseError('Connection failed');
        
        expect(error.name).toBe('DatabaseError');
        expect(error.message).toBe('Connection failed');
        expect(error.originalError).toBeUndefined();
      });

      it('should create DatabaseError with original error', () => {
        const originalError = new Error('ECONNREFUSED');
        const error = new DatabaseError('Connection failed', originalError);
        
        expect(error.name).toBe('DatabaseError');
        expect(error.message).toBe('Connection failed');
        expect(error.originalError).toBe(originalError);
      });
    });

    describe('ValidationError', () => {
      it('should create ValidationError with message', () => {
        const error = new ValidationError('Invalid input');
        
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Invalid input');
        expect(error.details).toBeUndefined();
      });

      it('should create ValidationError with details', () => {
        const details = { field: 'email', error: 'Invalid format' };
        const error = new ValidationError('Validation failed', details);
        
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Validation failed');
        expect(error.details).toEqual(details);
      });
    });

    describe('AuthorizationError', () => {
      it('should create AuthorizationError with message', () => {
        const error = new AuthorizationError('Access denied');
        
        expect(error.name).toBe('AuthorizationError');
        expect(error.message).toBe('Access denied');
      });
    });
  });
});
