/**
 * JWT Validation Middleware
 * 
 * Validates JWT tokens from Amazon Cognito and extracts user context.
 * Implements public key caching for performance optimization.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 10.2
 */

import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { JWTClaims, AuthContext, AuthError, AuthErrorCode } from '../models/auth';
import { logAuthentication } from '../utils/logger';

/**
 * JWKS client cache
 * Stores JWKS clients per User Pool to enable key caching
 */
const jwksClients = new Map<string, jwksClient.JwksClient>();

/**
 * Get or create JWKS client for a User Pool
 */
function getJwksClient(userPoolId: string, region: string): jwksClient.JwksClient {
  const cacheKey = `${region}:${userPoolId}`;
  
  let client = jwksClients.get(cacheKey);
  if (!client) {
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    
    client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 60 * 60 * 1000, // 1 hour
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    
    jwksClients.set(cacheKey, client);
  }
  
  return client;
}

/**
 * Get public key for token verification with caching
 */
async function getPublicKey(kid: string, userPoolId: string, region: string): Promise<string> {
  const client = getJwksClient(userPoolId, region);
  
  try {
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  } catch (error) {
    // Log detailed error for debugging
    console.error('JWKS Error Details:', {
      error: error,
      errorMessage: error instanceof Error ? error.message : 'Unknown',
      errorStack: error instanceof Error ? error.stack : undefined,
      kid,
      userPoolId,
      region,
    });
    
    throw new AuthError(
      AuthErrorCode.INVALID_TOKEN,
      `Failed to get public key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract token from Authorization header
 */
function extractToken(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new AuthError(
      AuthErrorCode.MISSING_TOKEN,
      'Authorization header is missing'
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthError(
      AuthErrorCode.INVALID_TOKEN,
      'Authorization header must be in format: Bearer <token>'
    );
  }

  return parts[1];
}

/**
 * Validate JWT token and extract claims
 * 
 * This function:
 * 1. Extracts the token from the Authorization header
 * 2. Decodes the token header to get the key ID (kid)
 * 3. Fetches the public key from Cognito (with caching)
 * 4. Verifies the token signature and expiration
 * 5. Extracts and validates claims
 * 
 * @param authHeader - Authorization header value (Bearer <token>)
 * @param userPoolId - Cognito User Pool ID
 * @param region - AWS region
 * @param requestId - Optional request ID for logging
 * @returns Authenticated user context
 * @throws AuthError for invalid, expired, or malformed tokens
 */
export async function validateJWT(
  authHeader: string | undefined,
  userPoolId: string,
  region: string,
  requestId?: string
): Promise<AuthContext> {
  try {
    // Extract token from header
    const token = extractToken(authHeader);

    // Decode token header to get kid (without verification)
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === 'string') {
      throw new AuthError(
        AuthErrorCode.INVALID_TOKEN,
        'Invalid token format'
      );
    }

    const kid = decodedHeader.header.kid;
    if (!kid) {
      throw new AuthError(
        AuthErrorCode.INVALID_TOKEN,
        'Token missing key ID (kid)'
      );
    }

    // Get public key (with caching)
    const publicKey = await getPublicKey(kid, userPoolId, region);

    // Verify token signature and expiration
    const claims = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    }) as JWTClaims;

    // Extract tenant_id from custom claims
    const tenantId = claims['custom:tenant_id'];
    if (!tenantId) {
      throw new AuthError(
        AuthErrorCode.MISSING_TENANT_ID,
        'Token missing tenant_id claim'
      );
    }

    // Extract roles from Cognito groups
    const roles = claims['cognito:groups'] || [];

    // Build auth context
    const authContext: AuthContext = {
      user_id: claims.sub,
      tenant_id: tenantId,
      roles,
      username: claims['cognito:username'],
      email: claims.email,
    };

    // Log successful authentication
    if (requestId) {
      logAuthentication({
        requestId,
        success: true,
        tenantId: authContext.tenant_id,
        userId: authContext.user_id,
        username: authContext.username,
      });
    }

    return authContext;
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      if (requestId) {
        logAuthentication({
          requestId,
          success: false,
          reason: 'Token has expired',
        });
      }
      throw new AuthError(
        AuthErrorCode.EXPIRED_TOKEN,
        'Token has expired'
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      if (requestId) {
        logAuthentication({
          requestId,
          success: false,
          reason: 'Invalid token signature',
        });
      }
      throw new AuthError(
        AuthErrorCode.INVALID_SIGNATURE,
        'Invalid token signature'
      );
    }

    // Re-throw AuthError as-is
    if (error instanceof AuthError) {
      if (requestId) {
        logAuthentication({
          requestId,
          success: false,
          reason: error.message,
        });
      }
      throw error;
    }

    // Wrap unknown errors
    const errorMessage = `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    if (requestId) {
      logAuthentication({
        requestId,
        success: false,
        reason: errorMessage,
      });
    }
    throw new AuthError(
      AuthErrorCode.INVALID_TOKEN,
      errorMessage
    );
  }
}

/**
 * Clear the public key cache
 * Useful for testing or forcing key refresh
 */
export function clearPublicKeyCache(): void {
  jwksClients.clear();
}
