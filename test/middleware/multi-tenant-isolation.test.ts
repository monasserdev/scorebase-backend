/**
 * Multi-Tenant Isolation Middleware Tests
 * 
 * Tests for tenant isolation enforcement at the database query level.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import {
  enforceMultiTenantIsolation,
  enforceMultiTenantIsolationSingle,
  enforceMultiTenantIsolationMany,
  TenantIsolationError,
  TenantIsolationErrorCode,
} from '../../src/middleware/multi-tenant-isolation';
import * as database from '../../src/config/database';

// Mock the database module
jest.mock('../../src/config/database');

describe('Multi-Tenant Isolation Middleware', () => {
  const mockQuery = database.query as jest.MockedFunction<typeof database.query>;
  const validTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const otherTenantId = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear console.error mock
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('enforceMultiTenantIsolation', () => {
    describe('tenant_id validation', () => {
      it('should throw error when tenant_id is missing', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';

        await expect(
          enforceMultiTenantIsolation('', query, [])
        ).rejects.toThrow(TenantIsolationError);

        await expect(
          enforceMultiTenantIsolation('', query, [])
        ).rejects.toMatchObject({
          code: TenantIsolationErrorCode.INVALID_TENANT_ID,
          message: 'tenant_id is required for all database queries',
        });

        // Verify security violation was logged
        expect(console.error).toHaveBeenCalledWith(
          'SECURITY_VIOLATION',
          expect.objectContaining({
            violation_type: 'MISSING_TENANT_ID',
            severity: 'HIGH',
          })
        );
      });

      it('should throw error when tenant_id is not a valid UUID', async () => {
        const invalidTenantId = 'not-a-uuid';
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';

        await expect(
          enforceMultiTenantIsolation(invalidTenantId, query, [])
        ).rejects.toThrow(TenantIsolationError);

        await expect(
          enforceMultiTenantIsolation(invalidTenantId, query, [])
        ).rejects.toMatchObject({
          code: TenantIsolationErrorCode.INVALID_TENANT_ID,
          message: 'tenant_id must be a valid UUID',
        });

        // Verify security violation was logged
        expect(console.error).toHaveBeenCalledWith(
          'SECURITY_VIOLATION',
          expect.objectContaining({
            violation_type: 'INVALID_TENANT_ID_FORMAT',
            severity: 'HIGH',
          })
        );
      });

      it('should accept valid UUID tenant_id', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        mockQuery.mockResolvedValue({
          rows: [{ league_id: '123', tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).resolves.toBeDefined();
      });
    });

    describe('query validation', () => {
      it('should throw error when query does not include tenant_id filter', async () => {
        const query = 'SELECT * FROM leagues WHERE league_id = $1';

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, ['league-123'])
        ).rejects.toThrow(TenantIsolationError);

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, ['league-123'])
        ).rejects.toMatchObject({
          code: TenantIsolationErrorCode.QUERY_MISSING_TENANT_FILTER,
          message: 'Query must include tenant_id filter in WHERE clause',
        });

        // Verify security violation was logged
        expect(console.error).toHaveBeenCalledWith(
          'SECURITY_VIOLATION',
          expect.objectContaining({
            violation_type: 'QUERY_MISSING_TENANT_FILTER',
            severity: 'HIGH',
          })
        );
      });

      it('should accept query with tenant_id filter', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        mockQuery.mockResolvedValue({
          rows: [{ league_id: '123', tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).resolves.toBeDefined();
      });

      it('should accept query with tenant_id in complex WHERE clause', async () => {
        const query = `
          SELECT * FROM games 
          WHERE tenant_id = $1 
            AND season_id = $2 
            AND status = $3
        `;
        mockQuery.mockResolvedValue({
          rows: [{ game_id: '123', tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, ['season-123', 'live'])
        ).resolves.toBeDefined();
      });

      it('should handle case-insensitive tenant_id matching', async () => {
        const query = 'SELECT * FROM leagues WHERE TENANT_ID = $1';
        mockQuery.mockResolvedValue({
          rows: [{ league_id: '123', tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).resolves.toBeDefined();
      });
    });

    describe('query execution', () => {
      it('should prepend tenant_id to params array', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1 AND league_id = $2';
        const leagueId = 'league-123';
        
        mockQuery.mockResolvedValue({
          rows: [{ league_id: leagueId, tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await enforceMultiTenantIsolation(validTenantId, query, [leagueId]);

        expect(mockQuery).toHaveBeenCalledWith(query, [validTenantId, leagueId]);
      });

      it('should handle empty params array', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        
        mockQuery.mockResolvedValue({
          rows: [{ league_id: '123', tenant_id: validTenantId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await enforceMultiTenantIsolation(validTenantId, query, []);

        expect(mockQuery).toHaveBeenCalledWith(query, [validTenantId]);
      });

      it('should handle database errors gracefully', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        const dbError = new Error('Connection timeout');
        
        mockQuery.mockRejectedValue(dbError);

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).rejects.toThrow('Connection timeout');

        // Verify error was logged
        expect(console.error).toHaveBeenCalledWith(
          'Database query failed',
          expect.objectContaining({
            tenant_id: validTenantId,
            error: 'Connection timeout',
          })
        );
      });
    });

    describe('result verification', () => {
      it('should return results when all rows belong to tenant', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        const expectedRows = [
          { league_id: '123', tenant_id: validTenantId, name: 'League 1' },
          { league_id: '456', tenant_id: validTenantId, name: 'League 2' },
        ];
        
        mockQuery.mockResolvedValue({
          rows: expectedRows,
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        const result = await enforceMultiTenantIsolation(validTenantId, query, []);

        expect(result.rows).toEqual(expectedRows);
        expect(result.rowCount).toBe(2);
      });

      it('should throw error when result contains data from different tenant', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        const mixedRows = [
          { league_id: '123', tenant_id: validTenantId, name: 'League 1' },
          { league_id: '456', tenant_id: otherTenantId, name: 'League 2' }, // Wrong tenant!
        ];
        
        mockQuery.mockResolvedValue({
          rows: mixedRows,
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).rejects.toThrow(TenantIsolationError);

        await expect(
          enforceMultiTenantIsolation(validTenantId, query, [])
        ).rejects.toMatchObject({
          code: TenantIsolationErrorCode.TENANT_ISOLATION_VIOLATION,
          message: 'Query returned data belonging to a different tenant',
          details: {
            expected_tenant_id: validTenantId,
            actual_tenant_id: otherTenantId,
          },
        });

        // Verify security violation was logged
        expect(console.error).toHaveBeenCalledWith(
          'SECURITY_VIOLATION',
          expect.objectContaining({
            violation_type: 'CROSS_TENANT_DATA_LEAKAGE',
            severity: 'HIGH',
            details: expect.objectContaining({
              expected_tenant_id: validTenantId,
              actual_tenant_id: otherTenantId,
            }),
          })
        );
      });

      it('should handle empty result set', async () => {
        const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
        
        mockQuery.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        const result = await enforceMultiTenantIsolation(validTenantId, query, []);

        expect(result.rows).toEqual([]);
        expect(result.rowCount).toBe(0);
      });

      it('should handle rows without tenant_id field', async () => {
        const query = 'SELECT COUNT(*) as count FROM leagues WHERE tenant_id = $1';
        
        mockQuery.mockResolvedValue({
          rows: [{ count: 5 }], // No tenant_id in aggregate result
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

        const result = await enforceMultiTenantIsolation(validTenantId, query, []);

        expect(result.rows).toEqual([{ count: 5 }]);
      });
    });
  });

  describe('enforceMultiTenantIsolationSingle', () => {
    it('should return single row when found', async () => {
      const query = 'SELECT * FROM leagues WHERE tenant_id = $1 AND league_id = $2';
      const expectedRow = { league_id: '123', tenant_id: validTenantId, name: 'League 1' };
      
      mockQuery.mockResolvedValue({
        rows: [expectedRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await enforceMultiTenantIsolationSingle(
        validTenantId,
        query,
        ['123']
      );

      expect(result).toEqual(expectedRow);
    });

    it('should return null when no row found', async () => {
      const query = 'SELECT * FROM leagues WHERE tenant_id = $1 AND league_id = $2';
      
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await enforceMultiTenantIsolationSingle(
        validTenantId,
        query,
        ['999']
      );

      expect(result).toBeNull();
    });

    it('should return first row when multiple rows found', async () => {
      const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
      const rows = [
        { league_id: '123', tenant_id: validTenantId, name: 'League 1' },
        { league_id: '456', tenant_id: validTenantId, name: 'League 2' },
      ];
      
      mockQuery.mockResolvedValue({
        rows,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await enforceMultiTenantIsolationSingle(validTenantId, query, []);

      expect(result).toEqual(rows[0]);
    });
  });

  describe('enforceMultiTenantIsolationMany', () => {
    it('should return array of rows when found', async () => {
      const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
      const expectedRows = [
        { league_id: '123', tenant_id: validTenantId, name: 'League 1' },
        { league_id: '456', tenant_id: validTenantId, name: 'League 2' },
      ];
      
      mockQuery.mockResolvedValue({
        rows: expectedRows,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await enforceMultiTenantIsolationMany(validTenantId, query, []);

      expect(result).toEqual(expectedRows);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no rows found', async () => {
      const query = 'SELECT * FROM leagues WHERE tenant_id = $1';
      
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await enforceMultiTenantIsolationMany(validTenantId, query, []);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('security logging', () => {
    it('should log all security violations with proper structure', async () => {
      const query = 'SELECT * FROM leagues WHERE league_id = $1';

      await expect(
        enforceMultiTenantIsolation(validTenantId, query, ['123'])
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        'SECURITY_VIOLATION',
        expect.objectContaining({
          timestamp: expect.any(String),
          tenant_id: validTenantId,
          violation_type: 'QUERY_MISSING_TENANT_FILTER',
          severity: 'HIGH',
          details: expect.any(Object),
        })
      );
    });

    it('should include query details in security logs', async () => {
      const query = 'SELECT * FROM leagues WHERE league_id = $1';

      await expect(
        enforceMultiTenantIsolation(validTenantId, query, ['123'])
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        'SECURITY_VIOLATION',
        expect.objectContaining({
          details: expect.objectContaining({
            query: expect.stringContaining('SELECT'),
          }),
        })
      );
    });
  });
});
