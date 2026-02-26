/**
 * Standings Service Tests
 * 
 * Unit tests for StandingsService business logic.
 * Tests standings retrieval with proper ordering and error handling.
 * 
 * Requirements: 7.9, 14.13
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { StandingsService } from '../../src/services/standings-service';
import { StandingsRepository } from '../../src/repositories/standings-repository';
import { TeamStanding } from '../../src/models/standing';

// Mock StandingsRepository
class MockStandingsRepository {
  private standings: TeamStanding[] = [];

  setMockStandings(standings: TeamStanding[]) {
    this.standings = standings;
  }

  async findBySeasonId(
    _tenantId: string,
    seasonId: string
  ): Promise<TeamStanding[]> {
    // Filter by season_id and return pre-sorted standings
    return this.standings.filter(s => s.season_id === seasonId);
  }
}

describe('StandingsService', () => {
  let service: StandingsService;
  let mockRepository: MockStandingsRepository;

  beforeEach(() => {
    mockRepository = new MockStandingsRepository();
    service = new StandingsService(
      mockRepository as unknown as StandingsRepository
    );
  });

  describe('getStandingsBySeason', () => {
    it('should return standings ordered by points DESC', async () => {
      const mockStandings: TeamStanding[] = [
        {
          id: 'standing-1',
          season_id: 'season-123',
          team_id: 'team-1',
          games_played: 10,
          wins: 8,
          losses: 2,
          ties: 0,
          points: 24,
          goals_for: 30,
          goals_against: 15,
          goal_differential: 15,
          streak: 'W3',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
        {
          id: 'standing-2',
          season_id: 'season-123',
          team_id: 'team-2',
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
          updated_at: new Date('2024-01-15'),
        },
      ];

      mockRepository.setMockStandings(mockStandings);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-123'
      );

      expect(result).toHaveLength(2);
      expect(result[0].team_id).toBe('team-1');
      expect(result[0].points).toBe(24);
      expect(result[1].team_id).toBe('team-2');
      expect(result[1].points).toBe(15);
    });

    it('should return empty array when no standings exist', async () => {
      mockRepository.setMockStandings([]);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-456'
      );

      expect(result).toHaveLength(0);
    });

    it('should handle standings with ties correctly', async () => {
      const mockStandings: TeamStanding[] = [
        {
          id: 'standing-1',
          season_id: 'season-123',
          team_id: 'team-1',
          games_played: 10,
          wins: 7,
          losses: 1,
          ties: 2,
          points: 23, // 7*3 + 2*1
          goals_for: 25,
          goals_against: 10,
          goal_differential: 15,
          streak: 'W2',
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
      ];

      mockRepository.setMockStandings(mockStandings);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].ties).toBe(2);
      expect(result[0].points).toBe(23);
    });

    it('should preserve goal differential in standings', async () => {
      const mockStandings: TeamStanding[] = [
        {
          id: 'standing-1',
          season_id: 'season-123',
          team_id: 'team-1',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 15,
          goals_against: 8,
          goal_differential: 7,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
        {
          id: 'standing-2',
          season_id: 'season-123',
          team_id: 'team-2',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 12,
          goals_against: 10,
          goal_differential: 2,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
      ];

      mockRepository.setMockStandings(mockStandings);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-123'
      );

      expect(result).toHaveLength(2);
      // Both teams have same points, but team-1 has better goal differential
      expect(result[0].goal_differential).toBe(7);
      expect(result[1].goal_differential).toBe(2);
    });

    it('should handle optional streak field', async () => {
      const mockStandings: TeamStanding[] = [
        {
          id: 'standing-1',
          season_id: 'season-123',
          team_id: 'team-1',
          games_played: 1,
          wins: 1,
          losses: 0,
          ties: 0,
          points: 3,
          goals_for: 2,
          goals_against: 1,
          goal_differential: 1,
          // No streak field
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
      ];

      mockRepository.setMockStandings(mockStandings);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].streak).toBeUndefined();
    });

    it('should filter standings by season_id', async () => {
      const mockStandings: TeamStanding[] = [
        {
          id: 'standing-1',
          season_id: 'season-123',
          team_id: 'team-1',
          games_played: 5,
          wins: 3,
          losses: 2,
          ties: 0,
          points: 9,
          goals_for: 10,
          goals_against: 8,
          goal_differential: 2,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
        {
          id: 'standing-2',
          season_id: 'season-456',
          team_id: 'team-2',
          games_played: 3,
          wins: 2,
          losses: 1,
          ties: 0,
          points: 6,
          goals_for: 8,
          goals_against: 5,
          goal_differential: 3,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-15'),
        },
      ];

      mockRepository.setMockStandings(mockStandings);

      const result = await service.getStandingsBySeason(
        'tenant-123',
        'season-123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].season_id).toBe('season-123');
      expect(result[0].team_id).toBe('team-1');
    });
  });
});
