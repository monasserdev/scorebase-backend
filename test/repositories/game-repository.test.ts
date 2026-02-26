/**
 * Game Repository Tests
 * 
 * Unit tests for GameRepository with multi-tenant isolation validation.
 * 
 * Requirements: 2.1, 5.1, 5.2, 5.3, 5.4, 5.5, 10.3
 */

import { GameRepository } from '../../src/repositories/game-repository';
import { GameStatus } from '../../src/models/game';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';

// Mock the multi-tenant isolation middleware
jest.mock('../../src/middleware/multi-tenant-isolation');

describe('GameRepository', () => {
  let repository: GameRepository;
  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockSeasonId = '660e8400-e29b-41d4-a716-446655440001';
  const mockGameId = '770e8400-e29b-41d4-a716-446655440002';
  const mockHomeTeamId = '880e8400-e29b-41d4-a716-446655440003';
  const mockAwayTeamId = '990e8400-e29b-41d4-a716-446655440004';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockEnforceSingle = multiTenantIsolation.enforceMultiTenantIsolationSingle as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationSingle
  >;

  beforeEach(() => {
    repository = new GameRepository();
    jest.clearAllMocks();
  });

  describe('findBySeasonId', () => {
    it('should return all games for a season without filters', async () => {
      const mockRows = [
        {
          id: mockGameId,
          season_id: mockSeasonId,
          home_team_id: mockHomeTeamId,
          away_team_id: mockAwayTeamId,
          scheduled_at: new Date('2024-03-15T19:00:00Z'),
          status: 'scheduled',
          home_score: 0,
          away_score: 0,
          location: 'Main Arena',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: 'aa0e8400-e29b-41d4-a716-446655440005',
          season_id: mockSeasonId,
          home_team_id: mockAwayTeamId,
          away_team_id: mockHomeTeamId,
          scheduled_at: new Date('2024-03-20T20:00:00Z'),
          status: 'final',
          home_score: 95,
          away_score: 88,
          location: null,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-03-20'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      const games = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM games g');
      expect(query).toContain('INNER JOIN seasons s ON g.season_id = s.id');
      expect(query).toContain('INNER JOIN leagues l ON s.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND g.season_id = $2');
      expect(params).toEqual([mockSeasonId]);

      // Verify the results
      expect(games).toHaveLength(2);
      expect(games[0]).toMatchObject({
        id: mockGameId,
        season_id: mockSeasonId,
        home_team_id: mockHomeTeamId,
        away_team_id: mockAwayTeamId,
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        location: 'Main Arena',
      });
      expect(games[1]).toMatchObject({
        status: GameStatus.FINAL,
        home_score: 95,
        away_score: 88,
        location: undefined,
      });
    });

    it('should filter games by status', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        status: GameStatus.LIVE,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('g.status = $3');
      expect(params).toEqual([mockSeasonId, GameStatus.LIVE]);
    });

    it('should filter games by start date', async () => {
      mockEnforceMany.mockResolvedValue([]);
      const startDate = new Date('2024-03-01');

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        startDate,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('g.scheduled_at >= $3');
      expect(params).toEqual([mockSeasonId, startDate]);
    });

    it('should filter games by end date', async () => {
      mockEnforceMany.mockResolvedValue([]);
      const endDate = new Date('2024-03-31');

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        endDate,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('g.scheduled_at <= $3');
      expect(params).toEqual([mockSeasonId, endDate]);
    });

    it('should filter games by date range', async () => {
      mockEnforceMany.mockResolvedValue([]);
      const startDate = new Date('2024-03-01');
      const endDate = new Date('2024-03-31');

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        startDate,
        endDate,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('g.scheduled_at >= $3');
      expect(query).toContain('g.scheduled_at <= $4');
      expect(params).toEqual([mockSeasonId, startDate, endDate]);
    });

    it('should filter games by team (home or away)', async () => {
      mockEnforceMany.mockResolvedValue([]);
      const teamId = mockHomeTeamId;

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        teamId,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('(g.home_team_id = $3 OR g.away_team_id = $3)');
      expect(params).toEqual([mockSeasonId, teamId]);
    });

    it('should apply multiple filters simultaneously', async () => {
      mockEnforceMany.mockResolvedValue([]);
      const startDate = new Date('2024-03-01');
      const endDate = new Date('2024-03-31');

      await repository.findBySeasonId(mockTenantId, mockSeasonId, {
        status: GameStatus.FINAL,
        startDate,
        endDate,
        teamId: mockHomeTeamId,
      });

      const [, query, params] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('g.status = $3');
      expect(query).toContain('g.scheduled_at >= $4');
      expect(query).toContain('g.scheduled_at <= $5');
      expect(query).toContain('(g.home_team_id = $6 OR g.away_team_id = $6)');
      expect(params).toEqual([
        mockSeasonId,
        GameStatus.FINAL,
        startDate,
        endDate,
        mockHomeTeamId,
      ]);
    });

    it('should return empty array when season has no games', async () => {
      mockEnforceMany.mockResolvedValue([]);

      const games = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      expect(games).toEqual([]);
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findBySeasonId(mockTenantId, mockSeasonId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query uses placeholders instead of string concatenation
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockSeasonId);
    });

    it('should order games by scheduled_at ascending', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findBySeasonId(mockTenantId, mockSeasonId);

      const [, query] = mockEnforceMany.mock.calls[0];
      expect(query).toContain('ORDER BY g.scheduled_at ASC');
    });
  });

  describe('findById', () => {
    it('should return game when found and belongs to tenant', async () => {
      const mockRow = {
        id: mockGameId,
        season_id: mockSeasonId,
        home_team_id: mockHomeTeamId,
        away_team_id: mockAwayTeamId,
        scheduled_at: new Date('2024-03-15T19:00:00Z'),
        status: 'live',
        home_score: 45,
        away_score: 42,
        location: 'Main Arena',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-03-15'),
      };

      mockEnforceSingle.mockResolvedValue(mockRow);

      const game = await repository.findById(mockTenantId, mockGameId);

      // Verify the middleware was called with correct parameters
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('SELECT');
      expect(query).toContain('FROM games g');
      expect(query).toContain('INNER JOIN seasons s ON g.season_id = s.id');
      expect(query).toContain('INNER JOIN leagues l ON s.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND g.id = $2');
      expect(params).toEqual([mockGameId]);

      // Verify the result
      expect(game).not.toBeNull();
      expect(game).toMatchObject({
        id: mockGameId,
        season_id: mockSeasonId,
        home_team_id: mockHomeTeamId,
        away_team_id: mockAwayTeamId,
        status: GameStatus.LIVE,
        home_score: 45,
        away_score: 42,
        location: 'Main Arena',
      });
    });

    it('should return null when game not found', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      const game = await repository.findById(mockTenantId, mockGameId);

      expect(game).toBeNull();
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
    });

    it('should return null when game belongs to different tenant', async () => {
      // The multi-tenant isolation middleware will prevent cross-tenant access
      mockEnforceSingle.mockResolvedValue(null);

      const game = await repository.findById(mockTenantId, mockGameId);

      expect(game).toBeNull();
    });

    it('should use parameterized query with both tenant_id and game_id', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockGameId);

      const [, query, params] = mockEnforceSingle.mock.calls[0];
      // Verify query uses placeholders
      expect(query).toContain('$1');
      expect(query).toContain('$2');
      expect(query).not.toContain(mockTenantId);
      expect(query).not.toContain(mockGameId);
      expect(params).toEqual([mockGameId]);
    });
  });

  describe('tenant isolation enforcement', () => {
    it('should enforce tenant isolation for findBySeasonId', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Verify the enforceMultiTenantIsolationMany was called
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceMany.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should enforce tenant isolation for findById', async () => {
      mockEnforceSingle.mockResolvedValue(null);

      await repository.findById(mockTenantId, mockGameId);

      // Verify the enforceMultiTenantIsolationSingle was called
      expect(mockEnforceSingle).toHaveBeenCalledTimes(1);
      const [tenantId] = mockEnforceSingle.mock.calls[0];
      expect(tenantId).toBe(mockTenantId);
    });

    it('should use INNER JOIN to enforce tenant isolation through relationships', async () => {
      mockEnforceMany.mockResolvedValue([]);

      await repository.findBySeasonId(mockTenantId, mockSeasonId);

      const [, query] = mockEnforceMany.mock.calls[0];
      // Verify query joins through seasons and leagues for tenant isolation
      expect(query).toContain('INNER JOIN seasons s ON g.season_id = s.id');
      expect(query).toContain('INNER JOIN leagues l ON s.league_id = l.id');
      expect(query).toContain('l.tenant_id = $1');
    });
  });
});
