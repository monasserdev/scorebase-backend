/**
 * JWT Validation Middleware Tests
 * 
 * Tests for JWT token validation, public key caching, and error handling.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 10.2
 */

import * as jwt from 'jsonwebtoken';
import { validateJWT, clearPublicKeyCache } from '../../src/middleware/jwt-validation';
import { AuthError, AuthErrorCode } from '../../src/models/auth';

// Mock jwks-rsa
jest.mock('jwks-rsa', () => {
  return jest.fn(() => ({
    getSigningKey: jest.fn(),
  }));
});

const mockUserPoolId = 'us-east-1_TestPool123';
const mockRegion = 'us-east-1';

describe('JWT Validation Middleware', () => {
  beforeEach(() => {
    clearPublicKeyCache();
    jest.clearAllMocks();
  });

  describe('extractToken', () => {
    it('should throw MISSING_TOKEN when Authorization header is undefined', async () => {
      await expect(
        validateJWT(undefined, mockUserPoolId, mockRegion)
      ).rejects.toThrow(AuthError);
      
      await expect(
        validateJWT(undefined, mockUserPoolId, mockRegion)
      ).rejects.toMatchObject({
        code: AuthErrorCode.MISSING_TOKEN,
        message: 'Authorization header is missing',
      });
    });

    it('should throw INVALID_TOKEN when Authorization header format is invalid', async () => {
      await expect(
        validateJWT('InvalidFormat', mockUserPoolId, mockRegion)
      ).rejects.toThrow(AuthError);
    });
  });

  describe('token validation', () => {
    it('should throw INVALID_TOKEN for malformed tokens', async () => {
      await expect(
        validateJWT('Bearer invalid.token.here', mockUserPoolId, mockRegion)
      ).rejects.toThrow(AuthError);
      
      await expect(
        validateJWT('Bearer invalid.token.here', mockUserPoolId, mockRegion)
      ).rejects.toMatchObject({
        code: AuthErrorCode.INVALID_TOKEN,
      });
    });

    it('should throw INVALID_TOKEN for tokens without kid in header', async () => {
      // Create a token without kid in header
      const tokenWithoutKid = jwt.sign(
        {
          sub: 'user-123',
          'cognito:username': 'testuser',
          'custom:tenant_id': 'tenant-456',
        },
        'secret',
        { noTimestamp: true }
      );

      await expect(
        validateJWT(`Bearer ${tokenWithoutKid}`, mockUserPoolId, mockRegion)
      ).rejects.toMatchObject({
        code: AuthErrorCode.INVALID_TOKEN,
      });
    });

    it('should throw error for tokens that fail signature verification', async () => {
      // Create a token with a kid but signed with wrong key
      const invalidToken = jwt.sign(
        {
          sub: 'user-123',
          'cognito:username': 'testuser',
          'custom:tenant_id': 'tenant-456',
        },
        'wrong-secret',
        { 
          algorithm: 'HS256',
          keyid: 'test-key-id'
        }
      );

      await expect(
        validateJWT(`Bearer ${invalidToken}`, mockUserPoolId, mockRegion)
      ).rejects.toThrow(AuthError);
    });
  });

  describe('clearPublicKeyCache', () => {
    it('should clear the cache without errors', () => {
      expect(() => clearPublicKeyCache()).not.toThrow();
    });
  });
});
