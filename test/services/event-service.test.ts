/**
 * Event Service Tests
 * 
 * Unit tests for EventService covering:
 * - Event retrieval by game
 * - Event creation with validation
 * - Game status checks (prevent events on finalized games)
 * - Event persistence to DynamoDB
 * - Game state updates in RDS
 * - Standings recalculation on GAME_FINALIZED
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventService } from '../../src/services/event-service';
import { GameRepository } from '../../src/repositories/game-repository';
import { SeasonRepository } from '../../src/repositories/season-repository';
import { TeamRepository } from '../../src/repositories/team-repository';
import { StandingsRepository } from '../../src/repositories/standings-repository';
import { EventType, GameEvent, EventMetadata } from '../../src/models/event';
import { Game, GameStatus } from '../../src/models/game';
import { BadRequestError, NotFoundError } from '../../src/models/errors';

// Mock utility modules
jest.mock('../../src/utils/event-validation');
jest.mock('../../src/config/dynamodb');
jest.mock('../../src/utils/apply-event-to-game');
jest.mock('../../src/utils/standings-calculation');

import { validateEventPayload } from '../../src/utils/event-validation';
import { writeEvent, getEventsByGame } from '../../src/config/dynamodb';
import { applyEventToGame } from '../../src/utils/apply-event-to-game';
import { recalculateStandings } from '../../src/utils/standings-calculation';

const mockValidateEventPayload = validateEventPayload as jest.MockedFunction<typeof validateEventPayload>;
const mockWriteEvent = writeEvent as jest.MockedFunction<typeof writeEvent>;
const mockGetEventsByGame = getEventsByGame as jest.MockedFunction<typeof getEventsByGame>;
const mockApplyEventToGame = applyEventToGame as jest.MockedFunction<typeof applyEventToGame>;
const mockRecalculateStandings = recalculateStandings as jest.MockedFunction<typeof recalculateStandings>;

// Mock repository classes
class MockGameRepository {
  findById = jest.fn<(tenantId: string, gameId: string) => Promise<Game | null>>();
  findBySeasonId = jest.fn();
}

class MockSeasonRepository {
  findById = jest.fn();
}

class MockTeamRepository {
  findByLeagueId = jest.fn();
}

class MockStandingsRepository {
  upsertStandings = jest.fn();
  findBySeasonId = jest.fn();
}

describe('EventService', () => {
  let eventService: EventService;
  let mockGameRepository: MockGameRepository;
  let mockSeasonRepository: MockSeasonRepository;
  let mockTeamRepository: MockTeamRepository;
  let mockStandingsRepository: MockStandingsRepository;
  
  const tenantId = 'tenant-123';
  const gameId = 'game-456';
  const seasonId = 'season-789';

  beforeEach(() => {
    // Create fresh mock instances
    mockGameRepository = new MockGameRepository();
    mockSeasonRepository = new MockSeasonRepository();
    mockTeamRepository = new MockTeamRepository();
    mockStandingsRepository = new MockStandingsRepository();
    
    // Reset all mocks
    jest.clearAllMocks();

    eventService = new EventService(
      mockGameRepository as unknown as GameRepository,
      mockSeasonRepository as unknown as SeasonRepository,
      mockTeamRepository as unknown as TeamRepository,
      mockStandingsRepository as unknown as StandingsRepository
    );
  });

  describe('getEventsByGame', () => {
    it('should return events for a valid game', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockEvents: GameEvent[] = [
        {
          event_id: 'event-1',
          game_id: gameId,
          tenant_id: tenantId,
          event_type: EventType.GAME_STARTED,
          event_version: '1.0',
          occurred_at: '2024-01-01T10:00:00Z',
          sort_key: '2024-01-01T10:00:00Z#event-1',
          payload: { start_time: '2024-01-01T10:00:00Z' },
          metadata: { user_id: 'user-1', source: 'mobile' },
          ttl: 1234567890,
        },
      ];

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockGetEventsByGame.mockResolvedValue(mockEvents);

      const result = await eventService.getEventsByGame(tenantId, gameId);

      expect(result).toEqual(mockEvents);
      expect(mockGameRepository.findById).toHaveBeenCalledWith(tenantId, gameId);
      expect(mockGetEventsByGame).toHaveBeenCalledWith(gameId, tenantId);
    });

    it('should throw NotFoundError if game does not exist', async () => {
      mockGameRepository.findById.mockResolvedValue(null);

      await expect(
        eventService.getEventsByGame(tenantId, gameId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if game does not belong to tenant', async () => {
      mockGameRepository.findById.mockResolvedValue(null);

      await expect(
        eventService.getEventsByGame(tenantId, gameId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createEvent', () => {
    const metadata: EventMetadata = {
      user_id: 'user-1',
      source: 'mobile',
      ip_address: '192.168.1.1',
    };

    it('should create a GOAL_SCORED event successfully', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.LIVE,
        home_score: 0,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const payload = {
        team_id: 'team-1',
        player_id: 'player-1',
        period: 1,
        time_remaining: '10:30',
      };

      const mockEvent: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GOAL_SCORED,
        event_version: '1.0',
        occurred_at: '2024-01-01T10:00:00Z',
        sort_key: '2024-01-01T10:00:00Z#event-1',
        payload,
        metadata,
        ttl: 1234567890,
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockValidateEventPayload.mockReturnValue(undefined);
      mockWriteEvent.mockResolvedValue(mockEvent);
      mockApplyEventToGame.mockResolvedValue(undefined);

      const result = await eventService.createEvent(
        tenantId,
        gameId,
        EventType.GOAL_SCORED,
        payload,
        metadata
      );

      expect(result).toEqual(mockEvent);
      expect(mockGameRepository.findById).toHaveBeenCalledWith(tenantId, gameId);
      expect(mockValidateEventPayload).toHaveBeenCalledWith(EventType.GOAL_SCORED, payload);
      expect(mockWriteEvent).toHaveBeenCalledWith({
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GOAL_SCORED,
        payload,
        metadata,
      });
      expect(mockApplyEventToGame).toHaveBeenCalledWith(tenantId, gameId, mockEvent);
      expect(mockRecalculateStandings).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if game does not exist', async () => {
      mockGameRepository.findById.mockResolvedValue(null);

      const payload = { start_time: '2024-01-01T10:00:00Z' };

      await expect(
        eventService.createEvent(tenantId, gameId, EventType.GAME_STARTED, payload, metadata)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError with GAME_ALREADY_FINALIZED code for finalized games', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);

      const payload = {
        team_id: 'team-1',
        player_id: 'player-1',
        period: 1,
        time_remaining: '10:30',
      };

      try {
        await eventService.createEvent(
          tenantId,
          gameId,
          EventType.GOAL_SCORED,
          payload,
          metadata
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toBe('Cannot create events for finalized games');
        expect(error.code).toBe('GAME_ALREADY_FINALIZED');
      }
    });

    it('should validate event payload and throw on invalid data', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.LIVE,
        home_score: 0,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      
      const validationError = new BadRequestError('Invalid event payload');
      (validationError as any).code = 'INVALID_EVENT_PAYLOAD';
      mockValidateEventPayload.mockImplementation(() => {
        throw validationError;
      });

      const invalidPayload = { invalid: 'data' };

      await expect(
        eventService.createEvent(
          tenantId,
          gameId,
          EventType.GOAL_SCORED,
          invalidPayload,
          metadata
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('should trigger standings recalculation for GAME_FINALIZED events', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.LIVE,
        home_score: 3,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const payload = {
        final_home_score: 3,
        final_away_score: 2,
      };

      const mockEvent: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GAME_FINALIZED,
        event_version: '1.0',
        occurred_at: '2024-01-01T12:00:00Z',
        sort_key: '2024-01-01T12:00:00Z#event-1',
        payload,
        metadata,
        ttl: 1234567890,
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockValidateEventPayload.mockReturnValue(undefined);
      mockWriteEvent.mockResolvedValue(mockEvent);
      mockApplyEventToGame.mockResolvedValue(undefined);
      mockRecalculateStandings.mockResolvedValue(undefined);

      const result = await eventService.createEvent(
        tenantId,
        gameId,
        EventType.GAME_FINALIZED,
        payload,
        metadata
      );

      expect(result).toEqual(mockEvent);
      expect(mockRecalculateStandings).toHaveBeenCalledWith(
        tenantId,
        seasonId,
        mockGameRepository,
        mockStandingsRepository,
        mockSeasonRepository,
        mockTeamRepository
      );
    });

    it('should not trigger standings recalculation for non-GAME_FINALIZED events', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.SCHEDULED,
        home_score: 0,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const payload = { start_time: '2024-01-01T10:00:00Z' };

      const mockEvent: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.GAME_STARTED,
        event_version: '1.0',
        occurred_at: '2024-01-01T10:00:00Z',
        sort_key: '2024-01-01T10:00:00Z#event-1',
        payload,
        metadata,
        ttl: 1234567890,
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockValidateEventPayload.mockReturnValue(undefined);
      mockWriteEvent.mockResolvedValue(mockEvent);
      mockApplyEventToGame.mockResolvedValue(undefined);

      await eventService.createEvent(
        tenantId,
        gameId,
        EventType.GAME_STARTED,
        payload,
        metadata
      );

      expect(mockRecalculateStandings).not.toHaveBeenCalled();
    });

    it('should write event to DynamoDB with correct parameters', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.LIVE,
        home_score: 0,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const payload = {
        team_id: 'team-1',
        penalty_type: 'Tripping',
        duration_minutes: 2,
        player_id: 'player-1',
        period: 2,
        time_remaining: '05:00',
      };

      const mockEvent: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.PENALTY_ASSESSED,
        event_version: '1.0',
        occurred_at: '2024-01-01T10:30:00Z',
        sort_key: '2024-01-01T10:30:00Z#event-1',
        payload,
        metadata,
        ttl: 1234567890,
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockValidateEventPayload.mockReturnValue(undefined);
      mockWriteEvent.mockResolvedValue(mockEvent);
      mockApplyEventToGame.mockResolvedValue(undefined);

      await eventService.createEvent(
        tenantId,
        gameId,
        EventType.PENALTY_ASSESSED,
        payload,
        metadata
      );

      expect(mockWriteEvent).toHaveBeenCalledWith({
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.PENALTY_ASSESSED,
        payload,
        metadata,
      });
    });

    it('should apply event to game state after writing to DynamoDB', async () => {
      const mockGame: Game = {
        id: gameId,
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date(),
        status: GameStatus.LIVE,
        home_score: 1,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const payload = {
        period: 1,
        home_score: 1,
        away_score: 0,
      };

      const mockEvent: GameEvent = {
        event_id: 'event-1',
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.PERIOD_ENDED,
        event_version: '1.0',
        occurred_at: '2024-01-01T10:20:00Z',
        sort_key: '2024-01-01T10:20:00Z#event-1',
        payload,
        metadata,
        ttl: 1234567890,
      };

      mockGameRepository.findById.mockResolvedValue(mockGame);
      mockValidateEventPayload.mockReturnValue(undefined);
      mockWriteEvent.mockResolvedValue(mockEvent);
      mockApplyEventToGame.mockResolvedValue(undefined);

      await eventService.createEvent(
        tenantId,
        gameId,
        EventType.PERIOD_ENDED,
        payload,
        metadata
      );

      expect(mockApplyEventToGame).toHaveBeenCalledWith(tenantId, gameId, mockEvent);
    });
  });
});
