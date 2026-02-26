/**
 * Game Service Tests
 * 
 * Unit tests for GameService business logic.
 * Tests service methods with mocked repository.
 * 
 * Requirements: 5.1, 5.2, 14.9, 14.10
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GameService } from '../../src/services/game-service';
import { GameRepository } from '../../src/repositories/game-repository';
import { Game, GameStatus, GameFilters } from '../../src/models/game';
import { NotFoundError } from '../../src/models/errors';

// Mock GameRepository
class MockGameRepository {
  private games: Game[] = [];

  setMockGames(games: Game[]) {
    this.games = games;
  }

  async findBySeasonId(
    _tenantId: string,
    seasonId: string,
    filters?: GameFilters
  ): Promise<Game[]> {
    let results = this.games.filter(game => game.season_id === seasonId);

    // Apply status filter
    if (filters?.status) {
      results = results.filter(game => game.status === filters.status);
    }

    // Apply date range filters
    if (filters?.startDate) {
      results = results.filter(game => game.scheduled_at >= filters.startDate!);
    }

    if (filters?.endDate) {
      results = results.filter(game => game.scheduled_at <= filters.endDate!);
    }

    // Apply team filter
    if (filters?.teamId) {
      results = results.filter(
        game => game.home_team_id === filters.teamId || game.away_team_id === filters.teamId
      );
    }

    return results;
  }

  async findById(_tenantId: string, gameId: string): Promise<Game | null> {
    const game = this.games.find(g => g.id === gameId);
    return game || null;
  }
}

describe('GameService', () => {
  let service: GameService;
  let mockRepository: MockGameRepository;

  const mockGame1: Game = {
    id: 'game-1',
    season_id: 'season-1',
    home_team_id: 'team-1',
    away_team_id: 'team-2',
    scheduled_at: new Date('2024-01-15T18:00:00Z'),
    status: GameStatus.SCHEDULED,
    home_score: 0,
    away_score: 0,
    location: 'Arena A',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockGame2: Game = {
    id: 'game-2',
    season_id: 'season-1',
    home_team_id: 'team-3',
    away_team_id: 'team-1',
    scheduled_at: new Date('2024-01-20T19:00:00Z'),
    status: GameStatus.LIVE,
    home_score: 2,
    away_score: 1,
    location: 'Arena B',
    created_at: new Date('2024-01-02'),
    updated_at: new Date('2024-01-20'),
  };

  const mockGame3: Game = {
    id: 'game-3',
    season_id: 'season-1',
    home_team_id: 'team-2',
    away_team_id: 'team-3',
    scheduled_at: new Date('2024-01-25T20:00:00Z'),
    status: GameStatus.FINAL,
    home_score: 3,
    away_score: 2,
    created_at: new Date('2024-01-03'),
    updated_at: new Date('2024-01-25'),
  };

  const mockGame4: Game = {
    id: 'game-4',
    season_id: 'season-2',
    home_team_id: 'team-4',
    away_team_id: 'team-5',
    scheduled_at: new Date('2024-02-01T18:00:00Z'),
    status: GameStatus.SCHEDULED,
    home_score: 0,
    away_score: 0,
    created_at: new Date('2024-01-04'),
    updated_at: new Date('2024-01-04'),
  };

  beforeEach(() => {
    mockRepository = new MockGameRepository();
    mockRepository.setMockGames([mockGame1, mockGame2, mockGame3, mockGame4]);
    service = new GameService(mockRepository as unknown as GameRepository);
  });

  describe('getGamesBySeason', () => {
    it('should return all games for a season', async () => {
      const games = await service.getGamesBySeason('tenant-1', 'season-1');
      
      expect(games).toHaveLength(3);
      expect(games[0].id).toBe('game-1');
      expect(games[1].id).toBe('game-2');
      expect(games[2].id).toBe('game-3');
    });

    it('should return empty array when season has no games', async () => {
      const games = await service.getGamesBySeason('tenant-1', 'season-3');
      
      expect(games).toHaveLength(0);
    });

    it('should filter games by status', async () => {
      const filters: GameFilters = { status: GameStatus.SCHEDULED };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(1);
      expect(games[0].id).toBe('game-1');
      expect(games[0].status).toBe(GameStatus.SCHEDULED);
    });

    it('should filter games by live status', async () => {
      const filters: GameFilters = { status: GameStatus.LIVE };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(1);
      expect(games[0].id).toBe('game-2');
      expect(games[0].status).toBe(GameStatus.LIVE);
    });

    it('should filter games by final status', async () => {
      const filters: GameFilters = { status: GameStatus.FINAL };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(1);
      expect(games[0].id).toBe('game-3');
      expect(games[0].status).toBe(GameStatus.FINAL);
    });

    it('should filter games by start date', async () => {
      const filters: GameFilters = { startDate: new Date('2024-01-20T00:00:00Z') };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(2);
      expect(games[0].id).toBe('game-2');
      expect(games[1].id).toBe('game-3');
    });

    it('should filter games by end date', async () => {
      const filters: GameFilters = { endDate: new Date('2024-01-20T23:59:59Z') };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(2);
      expect(games[0].id).toBe('game-1');
      expect(games[1].id).toBe('game-2');
    });

    it('should filter games by date range', async () => {
      const filters: GameFilters = {
        startDate: new Date('2024-01-18T00:00:00Z'),
        endDate: new Date('2024-01-22T00:00:00Z'),
      };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(1);
      expect(games[0].id).toBe('game-2');
    });

    it('should filter games by team (home team)', async () => {
      const filters: GameFilters = { teamId: 'team-1' };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(2);
      expect(games[0].id).toBe('game-1');
      expect(games[0].home_team_id).toBe('team-1');
      expect(games[1].id).toBe('game-2');
      expect(games[1].away_team_id).toBe('team-1');
    });

    it('should filter games by team (away team)', async () => {
      const filters: GameFilters = { teamId: 'team-2' };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(2);
      expect(games[0].id).toBe('game-1');
      expect(games[0].away_team_id).toBe('team-2');
      expect(games[1].id).toBe('game-3');
      expect(games[1].home_team_id).toBe('team-2');
    });

    it('should filter games by team (home or away)', async () => {
      const filters: GameFilters = { teamId: 'team-3' };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(2);
      expect(games[0].id).toBe('game-2');
      expect(games[1].id).toBe('game-3');
    });

    it('should combine multiple filters', async () => {
      const filters: GameFilters = {
        status: GameStatus.FINAL,
        startDate: new Date('2024-01-20T00:00:00Z'),
        teamId: 'team-2',
      };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(1);
      expect(games[0].id).toBe('game-3');
    });

    it('should return empty array when filters match no games', async () => {
      const filters: GameFilters = {
        status: GameStatus.CANCELLED,
      };
      const games = await service.getGamesBySeason('tenant-1', 'season-1', filters);
      
      expect(games).toHaveLength(0);
    });
  });

  describe('getGameById', () => {
    it('should return game when it exists', async () => {
      const game = await service.getGameById('tenant-1', 'game-1');
      
      expect(game).toBeDefined();
      expect(game.id).toBe('game-1');
      expect(game.season_id).toBe('season-1');
      expect(game.home_team_id).toBe('team-1');
      expect(game.away_team_id).toBe('team-2');
      expect(game.status).toBe(GameStatus.SCHEDULED);
    });

    it('should return game with scores', async () => {
      const game = await service.getGameById('tenant-1', 'game-2');
      
      expect(game).toBeDefined();
      expect(game.home_score).toBe(2);
      expect(game.away_score).toBe(1);
      expect(game.status).toBe(GameStatus.LIVE);
    });

    it('should return game with optional location', async () => {
      const game = await service.getGameById('tenant-1', 'game-1');
      
      expect(game.location).toBe('Arena A');
    });

    it('should return game without optional location', async () => {
      const game = await service.getGameById('tenant-1', 'game-3');
      
      expect(game.location).toBeUndefined();
    });

    it('should throw NotFoundError when game does not exist', async () => {
      await expect(
        service.getGameById('tenant-1', 'non-existent')
      ).rejects.toThrow(NotFoundError);
      
      await expect(
        service.getGameById('tenant-1', 'non-existent')
      ).rejects.toThrow('Game not found');
    });
  });
});
