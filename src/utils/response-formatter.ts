/**
 * Response Formatting Utilities
 * 
 * Provides helper functions for creating standardized API responses.
 * All responses include request_id, timestamp, and CORS headers.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.9
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SuccessResponse,
  ErrorResponse,
  ErrorDetails,
  ResponseMeta,
  HttpStatus,
  ErrorCode,
} from '../models/response';

/**
 * CORS headers for all responses
 * Allows cross-origin requests from any origin with credentials
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Generate a unique request ID
 * Uses UUID v4 for globally unique identifiers
 * 
 * @returns UUID v4 string
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Generate ISO-8601 timestamp
 * Returns current time in ISO format with timezone
 * 
 * @returns ISO-8601 formatted timestamp
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Create a success response
 * 
 * Wraps response data in standard envelope with request_id and timestamp.
 * Automatically adds CORS headers.
 * 
 * @param data - Response payload
 * @param statusCode - HTTP status code (default: 200)
 * @param meta - Optional metadata (e.g., pagination)
 * @param requestId - Optional request ID (generated if not provided)
 * @returns API Gateway response object
 * 
 * @example
 * ```typescript
 * return successResponse({ leagues: [...] }, 200);
 * ```
 */
export function successResponse<T = any>(
  data: T,
  statusCode: HttpStatus = HttpStatus.OK,
  meta?: ResponseMeta,
  requestId?: string
) {
  const response: SuccessResponse<T> = {
    request_id: requestId || generateRequestId(),
    timestamp: generateTimestamp(),
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(response),
  };
}

/**
 * Create an error response
 * 
 * Wraps error information in standard envelope with request_id and timestamp.
 * Automatically adds CORS headers.
 * 
 * @param code - Machine-readable error code
 * @param message - Human-readable error message
 * @param statusCode - HTTP status code
 * @param details - Optional additional error context
 * @param requestId - Optional request ID (generated if not provided)
 * @returns API Gateway response object
 * 
 * @example
 * ```typescript
 * return errorResponse(
 *   ErrorCode.NOT_FOUND,
 *   'League not found',
 *   HttpStatus.NOT_FOUND
 * );
 * ```
 */
export function errorResponse(
  code: string,
  message: string,
  statusCode: HttpStatus,
  details?: any,
  requestId?: string
) {
  const errorDetails: ErrorDetails = {
    code,
    message,
    request_id: requestId || generateRequestId(),
  };

  if (details) {
    errorDetails.details = details;
  }

  const response: ErrorResponse = {
    error: errorDetails,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(response),
  };
}

/**
 * Create a validation error response (400)
 * 
 * @param message - Error message
 * @param details - Validation error details
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function validationErrorResponse(
  message: string,
  details?: any,
  requestId?: string
) {
  return errorResponse(
    ErrorCode.VALIDATION_ERROR,
    message,
    HttpStatus.BAD_REQUEST,
    details,
    requestId
  );
}

/**
 * Create an authentication error response (401)
 * 
 * @param message - Error message
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function authenticationErrorResponse(
  message: string,
  requestId?: string
) {
  return errorResponse(
    ErrorCode.AUTHENTICATION_ERROR,
    message,
    HttpStatus.UNAUTHORIZED,
    undefined,
    requestId
  );
}

/**
 * Create an authorization error response (403)
 * 
 * @param message - Error message
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function authorizationErrorResponse(
  message: string,
  requestId?: string
) {
  return errorResponse(
    ErrorCode.AUTHORIZATION_ERROR,
    message,
    HttpStatus.FORBIDDEN,
    undefined,
    requestId
  );
}

/**
 * Create a not found error response (404)
 * 
 * @param message - Error message
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function notFoundErrorResponse(
  message: string,
  requestId?: string
) {
  return errorResponse(
    ErrorCode.NOT_FOUND,
    message,
    HttpStatus.NOT_FOUND,
    undefined,
    requestId
  );
}

/**
 * Create an internal server error response (500)
 * 
 * @param message - Error message
 * @param details - Optional error details (sanitized for production)
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function internalErrorResponse(
  message: string = 'Internal server error',
  details?: any,
  requestId?: string
) {
  return errorResponse(
    ErrorCode.INTERNAL_ERROR,
    message,
    HttpStatus.INTERNAL_SERVER_ERROR,
    details,
    requestId
  );
}

/**
 * Create a service unavailable error response (503)
 * 
 * @param message - Error message
 * @param requestId - Optional request ID
 * @returns API Gateway response object
 */
export function serviceUnavailableErrorResponse(
  message: string = 'Service temporarily unavailable',
  requestId?: string
) {
  return errorResponse(
    ErrorCode.SERVICE_UNAVAILABLE,
    message,
    HttpStatus.SERVICE_UNAVAILABLE,
    undefined,
    requestId
  );
}
