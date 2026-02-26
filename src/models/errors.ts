/**
 * Application Error Models
 * 
 * Common error types used across the application.
 * These errors are mapped to appropriate HTTP status codes
 * by the error handling middleware.
 * 
 * Requirements: 8.5, 8.6, 8.7, 8.8
 */

/**
 * Resource not found error (404)
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
