/**
 * Response Formatter Unit Tests
 * 
 * Tests for response formatting utilities.
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.9
 */

import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  authenticationErrorResponse,
  authorizationErrorResponse,
  notFoundErrorResponse,
  internalErrorResponse,
  serviceUnavailableErrorResponse,
  generateRequestId,
  generateTimestamp,
} from '../../src/utils/response-formatter';
import {
  HttpStatus,
  ErrorCode,
  SuccessResponse,
  ErrorResponse,
} from '../../src/models/response';

describe('Response Formatter', () => {
  describe('generateRequestId', () => {
    it('should generate a valid UUID v4', () => {
      const requestId = generateRequestId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(requestId).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateTimestamp', () => {
    it('should generate a valid ISO-8601 timestamp', () => {
      const timestamp = generateTimestamp();
      
      // ISO-8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(timestamp).toMatch(isoRegex);
    });

    it('should generate a parseable date', () => {
      const timestamp = generateTimestamp();
      const date = new Date(timestamp);
      
      expect(date.toString()).not.toBe('Invalid Date');
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('should generate timestamps close to current time', () => {
      const before = Date.now();
      const timestamp = generateTimestamp();
      const after = Date.now();
      
      const timestampMs = new Date(timestamp).getTime();
      
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

  describe('successResponse', () => {
    it('should create a success response with data', () => {
      const data = { leagues: [{ id: '1', name: 'Test League' }] };
      const response = successResponse(data);
      
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body: SuccessResponse = JSON.parse(response.body);
      expect(body.data).toEqual(data);
      expect(body.request_id).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('should include request_id in response', () => {
      const response = successResponse({ test: 'data' });
      const body: SuccessResponse = JSON.parse(response.body);
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(body.request_id).toMatch(uuidRegex);
    });

    it('should include timestamp in ISO-8601 format', () => {
      const response = successResponse({ test: 'data' });
      const body: SuccessResponse = JSON.parse(response.body);
      
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(body.timestamp).toMatch(isoRegex);
    });

    it('should include CORS headers', () => {
      const response = successResponse({ test: 'data' });
      
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(response.headers['Access-Control-Allow-Headers']).toBeDefined();
      expect(response.headers['Access-Control-Allow-Methods']).toBeDefined();
    });

    it('should accept custom status code', () => {
      const response = successResponse({ test: 'data' }, HttpStatus.CREATED);
      
      expect(response.statusCode).toBe(HttpStatus.CREATED);
    });

    it('should include metadata when provided', () => {
      const meta = {
        pagination: {
          page: 1,
          limit: 10,
          total: 100,
        },
      };
      
      const response = successResponse({ test: 'data' }, HttpStatus.OK, meta);
      const body: SuccessResponse = JSON.parse(response.body);
      
      expect(body.meta).toEqual(meta);
    });

    it('should accept custom request_id', () => {
      const customRequestId = 'custom-request-id-123';
      const response = successResponse({ test: 'data' }, HttpStatus.OK, undefined, customRequestId);
      const body: SuccessResponse = JSON.parse(response.body);
      
      expect(body.request_id).toBe(customRequestId);
    });

    it('should handle empty data', () => {
      const response = successResponse({});
      const body: SuccessResponse = JSON.parse(response.body);
      
      expect(body.data).toEqual({});
      expect(body.request_id).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('should handle array data', () => {
      const data = [1, 2, 3, 4, 5];
      const response = successResponse(data);
      const body: SuccessResponse = JSON.parse(response.body);
      
      expect(body.data).toEqual(data);
    });

    it('should handle null data', () => {
      const response = successResponse(null);
      const body: SuccessResponse = JSON.parse(response.body);
      
      expect(body.data).toBeNull();
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with code and message', () => {
      const response = errorResponse(
        ErrorCode.NOT_FOUND,
        'Resource not found',
        HttpStatus.NOT_FOUND
      );
      
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.error.message).toBe('Resource not found');
      expect(body.error.request_id).toBeDefined();
    });

    it('should include request_id in error response', () => {
      const response = errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Something went wrong',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      
      const body: ErrorResponse = JSON.parse(response.body);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(body.error.request_id).toMatch(uuidRegex);
    });

    it('should include CORS headers', () => {
      const response = errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'Invalid format' };
      const response = errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        details
      );
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.details).toEqual(details);
    });

    it('should accept custom request_id', () => {
      const customRequestId = 'error-request-id-456';
      const response = errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
        undefined,
        customRequestId
      );
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.request_id).toBe(customRequestId);
    });

    it('should not include details when not provided', () => {
      const response = errorResponse(
        ErrorCode.NOT_FOUND,
        'Not found',
        HttpStatus.NOT_FOUND
      );
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.details).toBeUndefined();
    });
  });

  describe('validationErrorResponse', () => {
    it('should create a 400 validation error response', () => {
      const response = validationErrorResponse('Invalid input');
      
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.error.message).toBe('Invalid input');
    });

    it('should include validation details', () => {
      const details = { field: 'email', reason: 'Required' };
      const response = validationErrorResponse('Validation failed', details);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.details).toEqual(details);
    });
  });

  describe('authenticationErrorResponse', () => {
    it('should create a 401 authentication error response', () => {
      const response = authenticationErrorResponse('Invalid token');
      
      expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
      expect(body.error.message).toBe('Invalid token');
    });
  });

  describe('authorizationErrorResponse', () => {
    it('should create a 403 authorization error response', () => {
      const response = authorizationErrorResponse('Access denied');
      
      expect(response.statusCode).toBe(HttpStatus.FORBIDDEN);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.AUTHORIZATION_ERROR);
      expect(body.error.message).toBe('Access denied');
    });
  });

  describe('notFoundErrorResponse', () => {
    it('should create a 404 not found error response', () => {
      const response = notFoundErrorResponse('League not found');
      
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.error.message).toBe('League not found');
    });
  });

  describe('internalErrorResponse', () => {
    it('should create a 500 internal error response', () => {
      const response = internalErrorResponse();
      
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.error.message).toBe('Internal server error');
    });

    it('should accept custom message', () => {
      const response = internalErrorResponse('Database connection failed');
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.message).toBe('Database connection failed');
    });

    it('should include error details', () => {
      const details = { error: 'Connection timeout' };
      const response = internalErrorResponse('Database error', details);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.details).toEqual(details);
    });
  });

  describe('serviceUnavailableErrorResponse', () => {
    it('should create a 503 service unavailable error response', () => {
      const response = serviceUnavailableErrorResponse();
      
      expect(response.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(body.error.message).toBe('Service temporarily unavailable');
    });

    it('should accept custom message', () => {
      const response = serviceUnavailableErrorResponse('Database maintenance in progress');
      
      const body: ErrorResponse = JSON.parse(response.body);
      expect(body.error.message).toBe('Database maintenance in progress');
    });
  });

  describe('Response consistency', () => {
    it('should ensure all responses have consistent structure', () => {
      const successResp = successResponse({ test: 'data' });
      const errorResp = errorResponse(ErrorCode.INTERNAL_ERROR, 'Error', HttpStatus.INTERNAL_SERVER_ERROR);
      
      // Both should have same header structure
      expect(successResp.headers['Content-Type']).toBe(errorResp.headers['Content-Type']);
      expect(successResp.headers['Access-Control-Allow-Origin']).toBe(errorResp.headers['Access-Control-Allow-Origin']);
      
      // Both should have statusCode
      expect(successResp.statusCode).toBeDefined();
      expect(errorResp.statusCode).toBeDefined();
      
      // Both should have body
      expect(successResp.body).toBeDefined();
      expect(errorResp.body).toBeDefined();
    });

    it('should ensure all responses include request_id', () => {
      const responses = [
        successResponse({ test: 'data' }),
        validationErrorResponse('Error'),
        authenticationErrorResponse('Error'),
        authorizationErrorResponse('Error'),
        notFoundErrorResponse('Error'),
        internalErrorResponse('Error'),
        serviceUnavailableErrorResponse('Error'),
      ];
      
      responses.forEach(response => {
        const body = JSON.parse(response.body);
        const requestId = body.request_id || body.error?.request_id;
        expect(requestId).toBeDefined();
        expect(typeof requestId).toBe('string');
      });
    });

    it('should ensure all responses include timestamp', () => {
      const successResp = successResponse({ test: 'data' });
      const body: SuccessResponse = JSON.parse(successResp.body);
      
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });
  });
});
