/**
 * Authentication Models
 * 
 * Type definitions for JWT tokens and authentication context.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

/**
 * JWT token claims from Cognito
 */
export interface JWTClaims {
  sub: string;                    // User ID (Cognito user sub)
  email?: string;                 // User email
  'cognito:username': string;     // Username
  'cognito:groups'?: string[];    // User groups/roles
  'custom:tenant_id': string;     // Custom tenant_id attribute
  iss: string;                    // Issuer (Cognito User Pool)
  aud: string;                    // Audience (Client ID)
  token_use: string;              // Token type (id or access)
  auth_time: number;              // Authentication timestamp
  exp: number;                    // Expiration timestamp
  iat: number;                    // Issued at timestamp
}

/**
 * Authenticated user context extracted from JWT
 */
export interface AuthContext {
  user_id: string;                // User identifier (sub claim)
  tenant_id: string;              // Tenant identifier
  roles: string[];                // User roles/groups
  username: string;               // Username
  email?: string;                 // User email (optional)
}

/**
 * Authentication error types
 */
export enum AuthErrorCode {
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MISSING_TENANT_ID = 'MISSING_TENANT_ID',
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
