/**
 * Tests for Apply Event to Game Module
 * 
 * Validates that events correctly update game state in RDS using transactions.
 * Tests each event type handler and error conditions.
 */

import { applyEventToGame } from '../../src/utils/apply-event-to-game';
import { EventType, GameEvent } from '../../src/models/event';
import { GameStatus } from '../../src/models/game';
import * as database from '../../src/config/database';

// Mock database module
jest.mock('../../src/config/database');

const mockQuery = jest.fn();

beforeEach(() => {
  // Reset mocks
  mockQuery.mockReset();
  
  // Mock transaction to execute callback immediately with mock client
  (database.transaction as jest.Mock).mockImplementation(async (callback: any) => {
    const mockClient = {
      query: mockQuery
    };
    return callback(mockClient);
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('applyEventToGame', () => {
  const tenantId = 'tenant-123';
  const gameId = 'game-456';
  const homeTeamId = 'team-home';
  const awayTeamId = 'team-away';

  const mockGame = {
    id: gameId,
    status: GameStatus.SCHEDULED,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_score: 0,
    away_score: 0
  };

  describe('GOAL_SCORED event', () => {
    it('should increment home team score when home team scores', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      // Mock score update
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-1`,
        payload: {
          team_id: homeTeamId,
          player_id: 'player-1',
          period: 1,
          time_remaining: '10:00'
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify game lookup query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT g.id, g.status'),
        [tenantId, gameId]
      );

      // Verify home score increment
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('home_score = home_score + 1'),
        [gameId]
      );
    });

    it('should increment away team score when away team scores', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      // Mock score update
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-2',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-2`,
        payload: {
          team_id: awayTeamId,
          player_id: 'player-2',
          period: 1,
          time_remaining: '08:30'
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify away score increment
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('away_score = away_score + 1'),
        [gameId]
      );
    });

    it('should throw error when team is not part of game', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      const event: GameEvent = {
        event_id: 'event-3',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-3`,
        payload: {
          team_id: 'wrong-team-id',
          player_id: 'player-3',
          period: 1,
          time_remaining: '05:00'
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await expect(applyEventToGame(tenantId, gameId, event)).rejects.toThrow(
        'Team wrong-team-id is not part of game'
      );
    });
  });

  describe('GAME_STARTED event', () => {
    it('should set game status to live', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      // Mock status update
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-4',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GAME_STARTED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-4`,
        payload: {
          start_time: new Date().toISOString()
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify status update to 'live'
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        [GameStatus.LIVE, gameId]
      );
    });
  });

  describe('GAME_FINALIZED event', () => {
    it('should set game status to final and update scores', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      // Mock finalize update
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-5',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GAME_FINALIZED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-5`,
        payload: {
          final_home_score: 3,
          final_away_score: 2
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify status and scores update
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        [GameStatus.FINAL, 3, 2, gameId]
      );
    });
  });

  describe('GAME_CANCELLED event', () => {
    it('should set game status to cancelled', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      // Mock cancel update
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-6',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GAME_CANCELLED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-6`,
        payload: {
          reason: 'Weather conditions',
          cancelled_at: new Date().toISOString()
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify status update to 'cancelled'
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        [GameStatus.CANCELLED, gameId]
      );
    });
  });

  describe('Other event types', () => {
    it('should not modify game state for PENALTY_ASSESSED', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      const event: GameEvent = {
        event_id: 'event-7',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.PENALTY_ASSESSED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-7`,
        payload: {
          team_id: homeTeamId,
          player_id: 'player-1',
          penalty_type: 'Tripping',
          duration_minutes: 2,
          period: 1,
          time_remaining: '12:00'
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify only game lookup was called, no updates
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should not modify game state for PERIOD_ENDED', async () => {
      // Mock game lookup
      mockQuery.mockResolvedValueOnce({
        rows: [mockGame]
      });

      const event: GameEvent = {
        event_id: 'event-8',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.PERIOD_ENDED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-8`,
        payload: {
          period: 1,
          home_score: 1,
          away_score: 1
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await applyEventToGame(tenantId, gameId, event);

      // Verify only game lookup was called, no updates
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should throw error when game not found', async () => {
      // Mock game lookup returning no rows
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-9',
        game_id: 'non-existent-game',
        tenant_id: tenantId,
        event_type: EventType.GAME_STARTED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-9`,
        payload: {
          start_time: new Date().toISOString()
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await expect(applyEventToGame(tenantId, 'non-existent-game', event)).rejects.toThrow(
        'Game not found: non-existent-game'
      );
    });

    it('should throw error when game does not belong to tenant', async () => {
      // Mock game lookup returning no rows (tenant mismatch)
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const event: GameEvent = {
        event_id: 'event-10',
        game_id: gameId,
        tenant_id: 'wrong-tenant',
        event_type: EventType.GAME_STARTED,
        event_version: '1.0',
        occurred_at: new Date().toISOString(),
        sort_key: `${new Date().toISOString()}#event-10`,
        payload: {
          start_time: new Date().toISOString()
        },
        metadata: {
          user_id: 'user-1',
          source: 'mobile-app'
        },
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      await expect(applyEventToGame('wrong-tenant', gameId, event)).rejects.toThrow(
        'Game not found'
      );
    });
  });
});
