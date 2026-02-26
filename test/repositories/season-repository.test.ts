/**
 * Season Repository Tests
 * 
 * Unit tests for SeasonRepository with multi-tenant isolation validation.
 * Tests verify tenant isolation, parameterized queries, and error handling.
 * 
 * Requirements: 3.3, 3.4, 2.1, 10.3
 */

import { SeasonRepository } from '../../src/repositories/season-repository';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';

// Mock the multi-tenant isolation middleware
jest.mock('../../src/middleware/multi-tenant-isolation');

describe('SeasonRepository', () => {
  let repository: SeasonRepository;
  const mockTenantId = '11111111-1111-1111-1111-111111111111';
  const mockLeagueId = '22222222-2222-2222-2222-222222222222';
  const mockSeasonId = '33333333-3333-3333-3333-333333333333';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockEnforceSingle = multiTenantIsolation.enforceMultiTenantIsolationSingle as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationSingle
  >;

  beforeEach(() => {
    repository = new SeasonRepository();
    jest.clearAllMocks();
  });

  describe('findByLeagueId', () => {
    it('should return seasons for a league with tenant isolation', async () => {
      // Mock database response
      const mockRows = [
        {
          id: mockSeasonId,
          league_id: mockLeagueId,
          name: 'Fall 2024',
          start_date: new Date('2024-09-01'),
          end_date: new Date('2024-12-31'),
          is_active: true,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          league_id: mockLeagueId,
          name: 'Spring 2024',
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-05-31'),
          is_active: false,
          created_at: new Date('2023-12-01'),
          updated_at: new Date('2023-12-01'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const result = await repository.findByLeagueId(mockTenantId, mockLeagueId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM seasons');
      expect(query).toContain('INNER JOIN leagues');
      expect(query).toContain('tenant_id = $1');
      expect(query).toContain('league_id = $2');
      expect(params).toEqual([mockLeagueId]);

      // Verify the results
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: mockSeasonId,
        league_id: mockLeagueId,
        name: 'Fall 2024',
        is_active: true,
      });
      expect(result[1]).toMatchObject({
        name: 'Spring 2024',
        is_active: false,
      });
    });

    it('should return empty array when no seasons found', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const result = await repository.findByLeagueId(mockTenantId, mockLeagueId);

      expect(result).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized queries to prevent SQL injection', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByLeagueId(mockTenantId, mockLeagueId);

      const [, query, params] = mockEnforceMany.mock.calls[0];
      // Verify query uses $1 and $2 placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockLeagueId);
      expect(params).toEqual([mockLeagueId]);
    });
  });

  describe('findActiveByLeagueId', () => {
    it('should return only active seasons for a league', async () => {
      // Mock database response with only active seasons
      const mockRows = [
        {
          id: mockSeasonId,
          league_id: mockLeagueId,
          name: 'Fall 2024',
          start_date: new Date('2024-09-01'),
          end_date: new Date('2024-12-31'),
          is_active: true,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const result = await repository.findActiveByLeagueId(mockTenantId, mockLeagueId);

      // Verify the middleware was called
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('is_active = true');
      expect(query).toContain('INNER JOIN leagues');
      expect(params).toEqual([mockLeagueId]);

      // Verify the results
      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(true);
      expect(result[0].name).toBe('Fall 2024');
    });

    it('should return empty array when no active seasons found', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const result = await repository.findActiveByLeagueId(mockTenantId, mockLeagueId);

      expect(result).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should enforce tenant isolation for active seasons', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findActiveByLeagueId(mockTenantId, mockLeagueId);

      const [tenantId, query] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('tenant_id = $1');
    });
  });

  describe('findById', () => {
    it('should return season by ID with tenant validation', async () => {
      // Mock database response
      const mockRow = {
        id: mockSeasonId,
        league_id: mockLeagueId,
        name: 'Fall 2024',
        start_date: new Date('2024-09-01'),
        end_date: new Date('2024-12-31'),
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const result = await repository.findById(mockTenantId, mockSeasonId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM seasons');
      expect(query).toContain('INNER JOIN leagues');
      expect(query).toContain('tenant_id = $1');
      expect(query).toContain('s.id = $2');
      expect(params).toEqual([mockSeasonId]);

      // Verify the result
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: mockSeasonId,
        league_id: mockLeagueId,
        name: 'Fall 2024',
        is_active: true,
      });
    });

    it('should return null when season not found', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      const result = await repository.findById(mockTenantId, mockSeasonId);

      expect(result).toBeNull();
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
    });

    it('should return null when season belongs to different tenant', async () => {
      // The multi-tenant isolation middleware will prevent cross-tenant access
      mockEnforceSingle.mockResolvedValue(null);

      const result = await repository.findById(mockTenantId, mockSeasonId);

      expect(result).toBeNull();
    });

    it('should use parameterized query with both tenant_id and season_id', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockSeasonId);

      const [, query, params] = mockEnforceSingle.mock.calls[0];
      // Verify query uses $1 and $2 placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockSeasonId);
      expect(params).toEqual([mockSeasonId]);
    });
  });

  describe('Date handling', () => {
    it('should correctly map date fields from database rows', async () => {
      const startDate = new Date('2024-09-01');
      const endDate = new Date('2024-12-31');
      const createdAt = new Date('2024-01-01T10:00:00Z');
      const updatedAt = new Date('2024-01-15T15:30:00Z');

      const mockRow = {
        id: mockSeasonId,
        league_id: mockLeagueId,
        name: 'Fall 2024',
        start_date: startDate,
        end_date: endDate,
        is_active: true,
        created_at: createdAt,
        updated_at: updatedAt,
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const result = await repository.findById(mockTenantId, mockSeasonId);

      expect(result).not.toBeNull();
      expect(result!.start_date.getTime()).toBe(startDate.getTime());
      expect(result!.end_date.getTime()).toBe(endDate.getTime());
      expect(result!.created_at.getTime()).toBe(createdAt.getTime());
      expect(result!.updated_at.getTime()).toBe(updatedAt.getTime());
    });
  });

  describe('Error handling', () => {
    it('should propagate database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockEnforceMany.mockRejectedValue(dbError);

      await expect(
        repository.findByLeagueId(mockTenantId, mockLeagueId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should propagate tenant isolation errors', async () => {
      const isolationError = new Error('Tenant isolation violation');
      mockEnforceSingle.mockRejectedValue(isolationError);

      await expect(
        repository.findById(mockTenantId, mockSeasonId)
      ).rejects.toThrow('Tenant isolation violation');
    });
  });

  describe('Tenant isolation enforcement', () => {
    it('should enforce tenant isolation for findByLeagueId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByLeagueId(mockTenantId, mockLeagueId);

      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findById', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockSeasonId);

      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findActiveByLeagueId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findActiveByLeagueId(mockTenantId, mockLeagueId);

      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });
  });
});

