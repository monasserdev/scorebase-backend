/**
 * Snapshot Service Tests
 * 
 * Unit tests for game snapshot generation logic.
 * Verifies snapshot structure, event ordering, and performance monitoring.
 * 
 * Requirements: 2.1-2.7, 3.1, 3.2, 8.1, 8.2, 10.1-10.8
 */

import { SnapshotService } from '../../src/services/snapshot-service';
import { GameRepository } from '../../src/repositories/game-repository';
import { Game, GameStatus } from '../../src/models/game';
import { GameEvent, EventType } from '../../src/models/event';
import { NotFoundError } from '../../src/models/errors';
import * as dynamodb from '../../src/config/dynamodb';

// Mock the dynamodb module
jest.mock('../../src/config/dynamodb');

describe('SnapshotService', () => {
  let snapshotService: SnapshotService;
  let mockGameRepository: jest.Mocked<GameRepository>;

  const mockGame: Game = {
    id: 'game-123',
    season_id: 'season-101',
    home_team_id: 'team-home',
    away_team_id: 'team-away',
    scheduled_at: new Date('2024-01-15T19:00:00Z'),
    status: GameStatus.LIVE,
    home_score: 3,
    away_score: 2,
    location: 'Test Arena',
    created_at: new Date('2024-01-15T18:00:00Z'),
    updated_at: new Date('2024-01-15T19:30:00Z'),
  };

  const mockEvents: GameEvent[] = [
    {
      event_id: 'event-1',
      game_id: 'game-123',
      tenant_id: 'tenant-456',
      event_type: EventType.GOAL_SCORED,
      event_version: '1.0',
      occurred_at: '2024-01-15T19:10:00Z',
      sort_key: '2024-01-15T19:10:00Z#event-1',
      payload: { team_id: 'team-home', player_id: 'player-1' },
      metadata: { user_id: 'user-1', source: 'scorekeeper' },
      ttl: 1234567890,
    },
    {
      event_id: 'event-2',
      game_id: 'game-123',
      tenant_id: 'tenant-456',
      event_type: EventType.GOAL_SCORED,
      event_version: '1.0',
      occurred_at: '2024-01-15T19:15:00Z',
      sort_key: '2024-01-15T19:15:00Z#event-2',
      payload: { team_id: 'team-away', player_id: 'player-2' },
      metadata: { user_id: 'user-1', source: 'scorekeeper' },
      ttl: 1234567890,
    },
    {
      event_id: 'event-3',
      game_id: 'game-123',
      tenant_id: 'tenant-456',
      event_type: EventType.GOAL_SCORED,
      event_version: '1.0',
      occurred_at: '2024-01-15T19:20:00Z',
      sort_key: '2024-01-15T19:20:00Z#event-3',
      payload: { team_id: 'team-home', player_id: 'player-3' },
      metadata: { user_id: 'user-1', source: 'scorekeeper' },
      ttl: 1234567890,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock repository
    mockGameRepository = {
      findById: jest.fn().mockResolvedValue(mockGame),
    } as any;

    // Mock DynamoDB getEventsByGame
    (dynamodb.getEventsByGame as jest.Mock) = jest.fn().mockResolvedValue(mockEvents);

    snapshotService = new SnapshotService(mockGameRepository);
  });

  describe('generateSnapshot', () => {
    it('should query GameRepository for current game state', async () => {
      const snapshot = await snapshotService.generateSnapshot('tenant-456', 'game-123');

      expect(mockGameRepository.findById).toHaveBeenCalledWith('tenant-456', 'game-123');
      expect(snapshot.game_id).toBe('game-123');
    });

    it('should throw NotFoundError if game does not exist', async () => {
      mockGameRepository.findById.mockResolvedValue(null);

      await expect(
        snapshotService.generateSnapshot('tenant-456', 'game-999')
      ).rejects.toThrow(NotFoundError);
    });

    it('should construct GameSnapshot with all required fields', async () => {
      const snapshot = await snapshotService.generateSnapshot('tenant-456', 'game-123');

      // Verify all required fields are present
      expect(snapshot).toHaveProperty('game_id');
      expect(snapshot).toHaveProperty('home_score');
      expect(snapshot).toHaveProperty('away_score');
      expect(snapshot).toHaveProperty('period');
      expect(snapshot).toHaveProperty('clock_seconds');
      expect(snapshot).toHaveProperty('status');
      expect(snapshot).toHaveProperty('recent_events');
      expect(snapshot).toHaveProperty('snapshot_version');
      expect(snapshot).toHaveProperty('generated_at');

      // Verify field values
      expect(snapshot.game_id).toBe('game-123');
      expect(snapshot.home_score).toBe(3);
      expect(snapshot.away_score).toBe(2);
      expect(snapshot.status).toBe('in_progress');
      expect(snapshot.snapshot_version).toBe('1.0');
    });
  });

  describe('generateSnapshotFromGame', () => {
    it('should query DynamoDB for 10 most recent events', async () => {
      await snapshotService.generateSnapshotFromGame('tenant-456', 'game-123', mockGame);

      expect(dynamodb.getEventsByGame).toHaveBeenCalledWith('game-123', 'tenant-456');
    });

    it('should order events by occurred_at descending', async () => {
      const snapshot = await snapshotService.generateSnapshotFromGame(
        'tenant-456',
        'game-123',
        mockGame
      );

      // Events should be ordered newest first
      expect(snapshot.recent_events.length).toBe(3);
      expect(snapshot.recent_events[0].event_id).toBe('event-3'); // 19:20:00
      expect(snapshot.recent_events[1].event_id).toBe('event-2'); // 19:15:00
      expect(snapshot.recent_events[2].event_id).toBe('event-1'); // 19:10:00
    });

    it('should limit recent events to 10 items', async () => {
      // Create 15 mock events
      const manyEvents: GameEvent[] = Array.from({ length: 15 }, (_, i) => ({
        event_id: `event-${i}`,
        game_id: 'game-123',
        tenant_id: 'tenant-456',
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: new Date(Date.now() + i * 1000).toISOString(),
        sort_key: `sort-${i}`,
        payload: {},
        metadata: { user_id: 'user-1', source: 'scorekeeper' },
        ttl: 1234567890,
      }));

      (dynamodb.getEventsByGame as jest.Mock).mockResolvedValue(manyEvents);

      const snapshot = await snapshotService.generateSnapshotFromGame(
        'tenant-456',
        'game-123',
        mockGame
      );

      expect(snapshot.recent_events.length).toBe(10);
    });

    it('should map game status to snapshot status format', async () => {
      const testCases = [
        { gameStatus: GameStatus.SCHEDULED, expectedStatus: 'scheduled' },
        { gameStatus: GameStatus.LIVE, expectedStatus: 'in_progress' },
        { gameStatus: GameStatus.FINAL, expectedStatus: 'final' },
        { gameStatus: GameStatus.POSTPONED, expectedStatus: 'postponed' },
        { gameStatus: GameStatus.CANCELLED, expectedStatus: 'postponed' },
      ];

      for (const { gameStatus, expectedStatus } of testCases) {
        const testGame = { ...mockGame, status: gameStatus };
        const snapshot = await snapshotService.generateSnapshotFromGame(
          'tenant-456',
          'game-123',
          testGame
        );

        expect(snapshot.status).toBe(expectedStatus);
      }
    });

    it('should include generated_at timestamp', async () => {
      const beforeTime = new Date().toISOString();
      
      const snapshot = await snapshotService.generateSnapshotFromGame(
        'tenant-456',
        'game-123',
        mockGame
      );

      const afterTime = new Date().toISOString();

      expect(snapshot.generated_at).toBeDefined();
      expect(snapshot.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(snapshot.generated_at >= beforeTime).toBe(true);
      expect(snapshot.generated_at <= afterTime).toBe(true);
    });

    it('should handle games with no events', async () => {
      (dynamodb.getEventsByGame as jest.Mock).mockResolvedValue([]);

      const snapshot = await snapshotService.generateSnapshotFromGame(
        'tenant-456',
        'game-123',
        mockGame
      );

      expect(snapshot.recent_events).toEqual([]);
      expect(snapshot.home_score).toBe(3);
      expect(snapshot.away_score).toBe(2);
    });
  });
});
