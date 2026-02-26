/**
 * League Repository Tests
 * 
 * Unit tests for LeagueRepository with multi-tenant isolation validation.
 * 
 * Requirements: 2.1, 3.1, 3.2, 10.3
 */

import { LeagueRepository } from '../../src/repositories/league-repository';
import { SportType } from '../../src/models/league';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';

// Mock the multi-tenant isolation middleware
jest.mock('../../src/middleware/multi-tenant-isolation');

describe('LeagueRepository', () => {
  let repository: LeagueRepository;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockLeagueId = '660e8400-e29b-41d4-a716-446655440001';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockEnforceSingle = multiTenantIsolation.enforceMultiTenantIsolationSingle as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationSingle
  >;

  beforeEach(() => {
    repository = new LeagueRepository();
    jest.clearAllMocks();
  });

  describe('findByTenantId', () => {
    it('should return all leagues for a tenant', async () => {
      // Mock the multi-tenant isolation middleware
      const mockRows = [
        {
          id: mockLeagueId,
          tenant_id: mockTenantId,
          name: 'Summer Basketball League',
          sport_type: 'basketball',
          logo_url: 'https://example.com/logo.png',
          primary_color: '#0B2545',
          secondary_color: '#FCCA46',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: '770e8400-e29b-41d4-a716-446655440002',
          tenant_id: mockTenantId,
          name: 'Winter Soccer League',
          sport_type: 'soccer',
          logo_url: null,
          primary_color: null,
          secondary_color: null,
          created_at: new Date('2024-02-01'),
          updated_at: new Date('2024-02-01'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const leagues = await repository.findByTenantId(mockTenantId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM leagues');
      expect(query).toContain('WHERE tenant_id = $1');
      expect(params).toEqual([]);

      // Verify the results
      expect(leagues).toHaveLength(2);
      expect(leagues[0]).toMatchObject({
        id: mockLeagueId,
        tenant_id: mockTenantId,
        name: 'Summer Basketball League',
        sport_type: SportType.BASKETBALL,
        logo_url: 'https://example.com/logo.png',
        primary_color: '#0B2545',
        secondary_color: '#FCCA46',
      });
      expect(leagues[1]).toMatchObject({
        name: 'Winter Soccer League',
        sport_type: SportType.SOCCER,
        logo_url: undefined,
        primary_color: undefined,
        secondary_color: undefined,
      });
    });

    it('should return empty array when tenant has no leagues', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const leagues = await repository.findByTenantId(mockTenantId);

      expect(leagues).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTenantId(mockTenantId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query uses $1 placeholder instead of string concatenation
      expect(query).toContain('$1');
      expect(query).not.toContain(mockTenantId);
    });
  });

  describe('findById', () => {
    it('should return league when found and belongs to tenant', async () => {
      const mockRow = {
        id: mockLeagueId,
        tenant_id: mockTenantId,
        name: 'Summer Basketball League',
        sport_type: 'basketball',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#0B2545',
        secondary_color: '#FCCA46',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const league = await repository.findById(mockTenantId, mockLeagueId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM leagues');
      expect(query).toContain('WHERE tenant_id = $1 AND id = $2');
      expect(params).toEqual([mockLeagueId]);

      // Verify the result
      expect(league).not.toBeNull();
      expect(league).toMatchObject({
        id: mockLeagueId,
        tenant_id: mockTenantId,
        name: 'Summer Basketball League',
        sport_type: SportType.BASKETBALL,
        logo_url: 'https://example.com/logo.png',
        primary_color: '#0B2545',
        secondary_color: '#FCCA46',
      });
    });

    it('should return null when league not found', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      const league = await repository.findById(mockTenantId, mockLeagueId);

      expect(league).toBeNull();
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
    });

    it('should return null when league belongs to different tenant', async () => {
      // The multi-tenant isolation middleware will prevent cross-tenant access
      // by returning null or throwing an error
      mockEnforceSingle.mockResolvedValue(null);

      const league = await repository.findById(mockTenantId, mockLeagueId);

      expect(league).toBeNull();
    });

    it('should use parameterized query with both tenant_id and league_id', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockLeagueId);

      const [, query, params] = mockEnforceSingle.mock.calls[0];
      // Verify query uses $1 and $2 placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockLeagueId);
      expect(params).toEqual([mockLeagueId]);
    });
  });

  describe('tenant isolation enforcement', () => {
    it('should enforce tenant isolation for findByTenantId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTenantId(mockTenantId);

      // Verify the enforceMultiTenantIsolationMany was called
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findById', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockLeagueId);

      // Verify the enforceMultiTenantIsolationSingle was called
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });
  });
});
