/**
 * Standings Repository Tests
 * 
 * Unit tests for StandingsRepository with multi-tenant isolation validation.
 * Tests cover:
 * - Finding standings by season with proper ordering
 * - Upserting standings with transaction support
 * - Tenant isolation enforcement
 * - Error handling for database failures
 * 
 * Requirements: 7.1, 7.9, 7.10, 2.1
 */

import { StandingsRepository } from '../../src/repositories/standings-repository';
import { StandingUpsertData } from '../../src/models/standing';
import * as multiTenantIsolation from '../../src/middleware/multi-tenant-isolation';
import * as database from '../../src/config/database';
import { PoolClient } from 'pg';

// Mock the multi-tenant isolation middleware and database
jest.mock('../../src/middleware/multi-tenant-isolation');
jest.mock('../../src/config/database');

describe('StandingsRepository', () => {
  let repository: StandingsRepository;
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSeasonId = '223e4567-e89b-12d3-a456-426614174000';

  const mockEnforceMany = multiTenantIsolation.enforceMultiTenantIsolationMany as jest.MockedFunction<
    typeof multiTenantIsolation.enforceMultiTenantIsolationMany
  >;
  const mockTransaction = database.transaction as jest.MockedFunction<
    typeof database.transaction
  >;

  beforeEach(() => {
    repository = new StandingsRepository();
    jest.clearAllMocks();
  });

  describe('findBySeasonId', () => {
    it('should return standings ordered by points DESC, goal_differential DESC', async () => {
      // Arrange
      const mockRows = [
        {
          id: '1',
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 10,
          wins: 8,
          losses: 2,
          ties: 0,
          points: 24,
          goals_for: 30,
          goals_against: 10,
          goal_differential: 20,
          streak: 'W3',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-10'),
        },
        {
          id: '2',
          season_id: mockSeasonId,
          team_id: 'team2',
          games_played: 10,
          wins: 5,
          losses: 5,
          ties: 0,
          points: 15,
          goals_for: 20,
          goals_against: 20,
          goal_differential: 0,
          streak: 'L2',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-10'),
        },
      ];

      mockEnforceMany.mockResolvedValue(mockRows);

      // Act
      const result = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].team_id).toBe('team1');
      expect(result[0].points).toBe(24);
      expect(result[0].goal_differential).toBe(20);
      expect(result[1].team_id).toBe('team2');
      expect(result[1].points).toBe(15);
    });

    it('should return empty array when no standings found', async () => {
      // Arrange
      mockEnforceMany.mockResolvedValue([]);

      // Act
      const result = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should enforce tenant isolation through joins', async () => {
      // Arrange
      mockEnforceMany.mockResolvedValue([]);

      // Act
      await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Assert
      expect(mockEnforceMany).toHaveBeenCalledTimes(1);
      const [tenantId, query, params] = mockEnforceMany.mock.calls[0];
      
      expect(tenantId).toBe(mockTenantId);
      expect(query).toContain('INNER JOIN seasons s ON st.season_id = s.id');
      expect(query).toContain('INNER JOIN leagues l ON s.league_id = l.id');
      expect(query).toContain('WHERE l.tenant_id = $1 AND st.season_id = $2');
      expect(query).toContain('ORDER BY st.points DESC, st.goal_differential DESC');
      expect(params).toEqual([mockSeasonId]);
    });

    it('should map database rows to TeamStanding models', async () => {
      // Arrange
      const mockRow = {
        id: '1',
        season_id: mockSeasonId,
        team_id: 'team1',
        games_played: 5,
        wins: 3,
        losses: 1,
        ties: 1,
        points: 10,
        goals_for: 15,
        goals_against: 8,
        goal_differential: 7,
        streak: 'W2',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-05'),
      };

      mockEnforceMany.mockResolvedValue([mockRow]);

      // Act
      const result = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Assert
      expect(result[0]).toEqual({
        id: '1',
        season_id: mockSeasonId,
        team_id: 'team1',
        games_played: 5,
        wins: 3,
        losses: 1,
        ties: 1,
        points: 10,
        goals_for: 15,
        goals_against: 8,
        goal_differential: 7,
        streak: 'W2',
        created_at: mockRow.created_at,
        updated_at: mockRow.updated_at,
      });
    });

    it('should handle null streak values', async () => {
      // Arrange
      const mockRow = {
        id: '1',
        season_id: mockSeasonId,
        team_id: 'team1',
        games_played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        goals_for: 0,
        goals_against: 0,
        goal_differential: 0,
        streak: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockEnforceMany.mockResolvedValue([mockRow]);

      // Act
      const result = await repository.findBySeasonId(mockTenantId, mockSeasonId);

      // Assert
      expect(result[0].streak).toBeUndefined();
    });
  });

  describe('upsertStandings', () => {
    it('should insert new standings using transaction', async () => {
      // Arrange
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      } as unknown as PoolClient;

      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      const standings: StandingUpsertData[] = [
        {
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 12,
          goals_against: 8,
          goal_differential: 4,
          streak: 'W2',
        },
      ];

      // Act
      await repository.upsertStandings(standings);

      // Assert
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      
      const query = (mockClient.query as jest.Mock).mock.calls[0][0];
      const params = (mockClient.query as jest.Mock).mock.calls[0][1];
      
      expect(query).toContain('INSERT INTO standings');
      expect(query).toContain('ON CONFLICT (season_id, team_id)');
      expect(query).toContain('DO UPDATE SET');
      expect(params).toEqual([
        mockSeasonId,
        'team1',
        5,
        3,
        2,
        0,
        9,
        12,
        8,
        4,
        'W2',
      ]);
    });

    it('should update existing standings using ON CONFLICT', async () => {
      // Arrange
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      } as unknown as PoolClient;

      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      const standings: StandingUpsertData[] = [
        {
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 10,
          wins: 7,
          losses: 3,
          ties: 0,
          points: 21,
          goals_for: 25,
          goals_against: 15,
          goal_differential: 10,
          streak: 'W3',
        },
      ];

      // Act
      await repository.upsertStandings(standings);

      // Assert
      const query = (mockClient.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('ON CONFLICT (season_id, team_id)');
      expect(query).toContain('games_played = EXCLUDED.games_played');
      expect(query).toContain('wins = EXCLUDED.wins');
      expect(query).toContain('points = EXCLUDED.points');
      expect(query).toContain('goal_differential = EXCLUDED.goal_differential');
    });

    it('should handle multiple standings in single transaction', async () => {
      // Arrange
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      } as unknown as PoolClient;

      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      const standings: StandingUpsertData[] = [
        {
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 12,
          goals_against: 8,
          goal_differential: 4,
        },
        {
          season_id: mockSeasonId,
          team_id: 'team2',
          games_played: 5,
          wins: 2,
          losses: 3,
          ties: 0,
          points: 6,
          goals_for: 8,
          goals_against: 12,
          goal_differential: -4,
        },
      ];

      // Act
      await repository.upsertStandings(standings);

      // Assert
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should handle null streak values in upsert', async () => {
      // Arrange
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      } as unknown as PoolClient;

      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      const standings: StandingUpsertData[] = [
        {
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          goals_for: 0,
          goals_against: 0,
          goal_differential: 0,
          // No streak property
        },
      ];

      // Act
      await repository.upsertStandings(standings);

      // Assert
      const params = (mockClient.query as jest.Mock).mock.calls[0][1];
      expect(params[10]).toBeNull(); // streak should be null
    });

    it('should do nothing when standings array is empty', async () => {
      // Act
      await repository.upsertStandings([]);

      // Assert
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      // Arrange
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Database error')),
      } as unknown as PoolClient;

      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      const standings: StandingUpsertData[] = [
        {
          season_id: mockSeasonId,
          team_id: 'team1',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 12,
          goals_against: 8,
          goal_differential: 4,
        },
      ];

      // Act & Assert
      await expect(repository.upsertStandings(standings)).rejects.toThrow('Database error');
    });
  });
});
