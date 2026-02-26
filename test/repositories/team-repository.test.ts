/**
 * Team Repository Tests
 * 
 * Unit tests for TeamRepository with multi-tenant isolation validation.
 * 
 * Requirements: 2.1, 4.1, 4.2, 10.3
 */

import { TeamRepository } from '../../src/repositories/team-repository';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';

// Mock the multi-tenant isolation middleware
jest.mock('../../src/middleware/multi-tenant-isolation');

describe('TeamRepository', () => {
  let repository: TeamRepository;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockLeagueId = '660e8400-e29b-41d4-a716-446655440001';
  const mockTeamId = '770e8400-e29b-41d4-a716-446655440002';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockEnforceSingle = multiTenantIsolation.enforceMultiTenantIsolationSingle as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationSingle
  >;

  beforeEach(() => {
    repository = new TeamRepository();
    jest.clearAllMocks();
  });

  describe('findByLeagueId', () => {
    it('should return all teams for a league', async () => {
      // Mock the multi-tenant isolation middleware
      const mockRows = [
        {
          id: mockTeamId,
          tenant_id: mockTenantId,
          league_id: mockLeagueId,
          name: 'Lakers',
          abbreviation: 'LAL',
          logo_url: 'https://example.com/lakers.png',
          primary_color: '#552583',
          secondary_color: '#FDB927',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: '880e8400-e29b-41d4-a716-446655440003',
          tenant_id: mockTenantId,
          league_id: mockLeagueId,
          name: 'Warriors',
          abbreviation: null,
          logo_url: null,
          primary_color: null,
          secondary_color: null,
          created_at: new Date('2024-02-01'),
          updated_at: new Date('2024-02-01'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const teams = await repository.findByLeagueId(mockTenantId, mockLeagueId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM teams t');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND t.league_id = $2');
      expect(params).toEqual([mockLeagueId]);

      // Verify the results
      expect(teams).toHaveLength(2);
      expect(teams[0]).toMatchObject({
        id: mockTeamId,
        tenant_id: mockTenantId,
        league_id: mockLeagueId,
        name: 'Lakers',
        abbreviation: 'LAL',
        logo_url: 'https://example.com/lakers.png',
        primary_color: '#552583',
        secondary_color: '#FDB927',
      });
      expect(teams[1]).toMatchObject({
        name: 'Warriors',
        abbreviation: undefined,
        logo_url: undefined,
        primary_color: undefined,
        secondary_color: undefined,
      });
    });

    it('should return empty array when league has no teams', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const teams = await repository.findByLeagueId(mockTenantId, mockLeagueId);

      expect(teams).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByLeagueId(mockTenantId, mockLeagueId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query uses $1 and $2 placeholders instead of string concatenation
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockLeagueId);
    });

    it('should enforce tenant isolation through league join', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByLeagueId(mockTenantId, mockLeagueId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query joins with leagues table for tenant isolation
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('l.tenant_id = $1');
    });
  });

  describe('findById', () => {
    it('should return team when found and belongs to tenant', async () => {
      const mockRow = {
        id: mockTeamId,
        tenant_id: mockTenantId,
        league_id: mockLeagueId,
        name: 'Lakers',
        abbreviation: 'LAL',
        logo_url: 'https://example.com/lakers.png',
        primary_color: '#552583',
        secondary_color: '#FDB927',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const team = await repository.findById(mockTenantId, mockTeamId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM teams t');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND t.id = $2');
      expect(params).toEqual([mockTeamId]);

      // Verify the result
      expect(team).not.toBeNull();
      expect(team).toMatchObject({
        id: mockTeamId,
        tenant_id: mockTenantId,
        league_id: mockLeagueId,
        name: 'Lakers',
        abbreviation: 'LAL',
        logo_url: 'https://example.com/lakers.png',
        primary_color: '#552583',
        secondary_color: '#FDB927',
      });
    });

    it('should return null when team not found', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      const team = await repository.findById(mockTenantId, mockTeamId);

      expect(team).toBeNull();
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
    });

    it('should return null when team belongs to different tenant', async () => {
      // The multi-tenant isolation middleware will prevent cross-tenant access
      // by returning null or throwing an error
      mockEnforceSingle.mockResolvedValue(null);

      const team = await repository.findById(mockTenantId, mockTeamId);

      expect(team).toBeNull();
    });

    it('should use parameterized query with both tenant_id and team_id', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockTeamId);

      const [, query, params] = mockEnforceSingle.mock.calls[0];
      // Verify query uses $1 and $2 placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockTeamId);
      expect(params).toEqual([mockTeamId]);
    });

    it('should enforce tenant isolation through league join', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockTeamId);

      const [, query] = mockEnforceSingle.mock.calls[0];
      // Verify query joins with leagues table for tenant isolation
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('l.tenant_id = $1');
    });
  });

  describe('tenant isolation enforcement', () => {
    it('should enforce tenant isolation for findByLeagueId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByLeagueId(mockTenantId, mockLeagueId);

      // Verify the enforceMultiTenantIsolationMany was called
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findById', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockTeamId);

      // Verify the enforceMultiTenantIsolationSingle was called
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });
  });
});
