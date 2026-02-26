/**
 * Player Repository Tests
 * 
 * Unit tests for PlayerRepository with multi-tenant isolation validation.
 * 
 * Requirements: 2.1, 4.3, 4.4, 10.3
 */

import { PlayerRepository } from '../../src/repositories/player-repository';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';

// Mock the multi-tenant isolation middleware
jest.mock('../../src/middleware/multi-tenant-isolation');

describe('PlayerRepository', () => {
  let repository: PlayerRepository;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTeamId = '770e8400-e29b-41d4-a716-446655440002';
  const mockPlayerId = '880e8400-e29b-41d4-a716-446655440003';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockEnforceSingle = multiTenantIsolation.enforceMultiTenantIsolationSingle as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationSingle
  >;

  beforeEach(() => {
    repository = new PlayerRepository();
    jest.clearAllMocks();
  });

  describe('findByTeamId', () => {
    it('should return all players for a team', async () => {
      // Mock the multi-tenant isolation middleware
      const mockRows = [
        {
          id: mockPlayerId,
          team_id: mockTeamId,
          first_name: 'LeBron',
          last_name: 'James',
          jersey_number: '23',
          position: 'Forward',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: '990e8400-e29b-41d4-a716-446655440004',
          team_id: mockTeamId,
          first_name: 'Anthony',
          last_name: 'Davis',
          jersey_number: null,
          position: null,
          created_at: new Date('2024-02-01'),
          updated_at: new Date('2024-02-01'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const players = await repository.findByTeamId(mockTenantId, mockTeamId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM players p');
      expect(query).toContain('INNER JOIN teams t ON p.team_id = t.id');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND p.team_id = $2');
      expect(params).toEqual([mockTeamId]);

      // Verify the results
      expect(players).toHaveLength(2);
      expect(players[0]).toMatchObject({
        id: mockPlayerId,
        team_id: mockTeamId,
        first_name: 'LeBron',
        last_name: 'James',
        jersey_number: '23',
        position: 'Forward',
      });
      expect(players[1]).toMatchObject({
        first_name: 'Anthony',
        last_name: 'Davis',
        jersey_number: undefined,
        position: undefined,
      });
    });

    it('should return empty array when team has no players', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const players = await repository.findByTeamId(mockTenantId, mockTeamId);

      expect(players).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTeamId(mockTenantId, mockTeamId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query uses $1 and $2 placeholders instead of string concatenation
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockTeamId);
    });

    it('should enforce tenant isolation through team and league joins', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTeamId(mockTenantId, mockTeamId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query joins with teams and leagues tables for tenant isolation
      expect(query).toContain('INNER JOIN teams t ON p.team_id = t.id');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('l.tenant_id = $1');
    });

    it('should order players by last name then first name', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTeamId(mockTenantId, mockTeamId);

      const [, query] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('ORDER BY p.last_name ASC, p.first_name ASC');
    });
  });

  describe('findById', () => {
    it('should return player when found and belongs to tenant', async () => {
      const mockRow = {
        id: mockPlayerId,
        team_id: mockTeamId,
        first_name: 'LeBron',
        last_name: 'James',
        jersey_number: '23',
        position: 'Forward',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const player = await repository.findById(mockTenantId, mockPlayerId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM players p');
      expect(query).toContain('INNER JOIN teams t ON p.team_id = t.id');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND p.id = $2');
      expect(params).toEqual([mockPlayerId]);

      // Verify the result
      expect(player).not.toBeNull();
      expect(player).toMatchObject({
        id: mockPlayerId,
        team_id: mockTeamId,
        first_name: 'LeBron',
        last_name: 'James',
        jersey_number: '23',
        position: 'Forward',
      });
    });

    it('should return null when player not found', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      const player = await repository.findById(mockTenantId, mockPlayerId);

      expect(player).toBeNull();
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
    });

    it('should return null when player belongs to different tenant', async () => {
      // The multi-tenant isolation middleware will prevent cross-tenant access
      // by returning null or throwing an error
      mockEnforceSingle.mockResolvedValue(null);

      const player = await repository.findById(mockTenantId, mockPlayerId);

      expect(player).toBeNull();
    });

    it('should use parameterized query with both tenant_id and player_id', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockPlayerId);

      const [, query, params] = mockEnforceSingle.mock.calls[0];
      // Verify query uses $1 and $2 placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockPlayerId);
      expect(params).toEqual([mockPlayerId]);
    });

    it('should enforce tenant isolation through team and league joins', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockPlayerId);

      const [, query] = mockEnforceSingle.mock.calls[0];
      // Verify query joins with teams and leagues tables for tenant isolation
      expect(query).toContain('INNER JOIN teams t ON p.team_id = t.id');
      expect(query).toContain('INNER JOIN leagues l ON t.league_id = l.id');
      expect(query).toContain('l.tenant_id = $1');
    });
  });

  describe('tenant isolation enforcement', () => {
    it('should enforce tenant isolation for findByTeamId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findByTeamId(mockTenantId, mockTeamId);

      // Verify the enforceMultiTenantIsolationMany was called
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findById', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockPlayerId);

      // Verify the enforceMultiTenantIsolationSingle was called
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });
  });
});
