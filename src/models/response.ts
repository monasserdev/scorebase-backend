/**
 * API Response Models
 * 
 * Type definitions for standardized API responses.
 * All responses include request_id and timestamp for traceability.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.9
 */

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  pagination?: PaginationMeta;
}

/**
 * Standard success response envelope
 */
export interface SuccessResponse<T = any> {
  request_id: string;
  timestamp: string;
  data: T;
  meta?: ResponseMeta;
}

/**
 * Error details object
 */
export interface ErrorDetails {
  code: string;
  message: string;
  request_id: string;
  details?: any;
}

/**
 * Standard error response envelope
 */
export interface ErrorResponse {
  error: ErrorDetails;
}

/**
 * HTTP status codes
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Standard error codes
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
