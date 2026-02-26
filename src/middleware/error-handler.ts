/**
 * Error Handling Middleware
 * 
 * Centralized error handling that catches and formats different types of errors
 * into standardized API responses with appropriate HTTP status codes.
 * 
 * Requirements: 8.5, 8.6, 8.7, 8.8
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { AuthError } from '../models/auth';
import { NotFoundError, BadRequestError, ForbiddenError, ServiceUnavailableError } from '../models/errors';
import {
  authenticationErrorResponse,
  authorizationErrorResponse,
  notFoundErrorResponse,
  validationErrorResponse,
  internalErrorResponse,
  serviceUnavailableErrorResponse,
} from '../utils/response-formatter';

/**
 * Database error class for connection and query errors
 */
export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Validation error class with optional field-level details
 */
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Authorization error class for permission-related errors
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Check if error is a database connection error
 * 
 * Detects common database connection error patterns:
 * - ECONNREFUSED: Connection refused
 * - ETIMEDOUT: Connection timeout
 * - ENOTFOUND: Host not found
 * - Connection terminated unexpectedly
 * 
 * @param error - Error to check
 * @returns True if error is a database connection error
 */
export function isDatabaseConnectionError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('connection terminated') ||
    message.includes('connection refused') ||
    message.includes('connect timeout') ||
    error.name === 'DatabaseError'
  );
}

/**
 * Handle error and format appropriate response
 * 
 * Maps application errors to standardized API responses with correct
 * HTTP status codes and error formats. Handles:
 * - Authentication errors (401)
 * - Authorization errors (403)
 * - Not found errors (404)
 * - Validation errors (400)
 * - Database connection errors (503)
 * - Generic errors (500)
 * 
 * @param error - Error to handle
 * @param requestId - Request ID for tracing
 * @returns Formatted API Gateway response
 * 
 * @example
 * ```typescript
 * try {
 *   // ... operation
 * } catch (error) {
 *   return handleError(error, requestId);
 * }
 * ```
 */
export function handleError(
  error: unknown,
  requestId: string
): APIGatewayProxyResult {
  // Ensure error is an Error object
  const err = error instanceof Error ? error : new Error(String(error));

  // Handle authentication errors (401)
  if (err instanceof AuthError) {
    return authenticationErrorResponse(err.message, requestId);
  }

  // Handle authorization errors (403)
  if (err instanceof ForbiddenError || err instanceof AuthorizationError) {
    return authorizationErrorResponse(err.message, requestId);
  }

  // Handle not found errors (404)
  if (err instanceof NotFoundError) {
    return notFoundErrorResponse(err.message, requestId);
  }

  // Handle validation errors (400)
  if (err instanceof BadRequestError || err instanceof ValidationError) {
    const details = (err as ValidationError).details;
    return validationErrorResponse(err.message, details, requestId);
  }

  // Handle database connection errors (503)
  if (err instanceof ServiceUnavailableError || isDatabaseConnectionError(err)) {
    const message = err instanceof ServiceUnavailableError
      ? err.message
      : 'Database connection failed';
    return serviceUnavailableErrorResponse(message, requestId);
  }

  // Handle generic errors (500)
  console.error('Unhandled error:', err);
  
  return internalErrorResponse(
    'Internal server error',
    process.env.NODE_ENV === 'development' ? { error: err.message } : undefined,
    requestId
  );
}

/**
 * Wrap an async function with error handling
 * 
 * Provides a higher-order function that automatically catches and handles
 * errors from async operations, converting them to formatted API responses.
 * 
 * @param fn - Async function to wrap
 * @param requestId - Request ID for tracing
 * @returns Wrapped function that handles errors
 * 
 * @example
 * ```typescript
 * const result = await withErrorHandling(
 *   async () => await service.getData(),
 *   requestId
 * );
 * ```
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  requestId: string
): Promise<T | APIGatewayProxyResult> {
  try {
    return await fn();
  } catch (error) {
    return handleError(error, requestId);
  }
}
