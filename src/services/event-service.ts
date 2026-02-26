/**
 * Event Service
 * 
 * Business logic layer for event operations.
 * Handles event creation with validation, persistence to DynamoDB,
 * and game state updates in RDS.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 14.11, 14.12
 */

import { GameRepository } from '../repositories/game-repository';
import { SeasonRepository } from '../repositories/season-repository';
import { TeamRepository } from '../repositories/team-repository';
import { StandingsRepository } from '../repositories/standings-repository';
import { GameEvent, CreateEventParams, EventType, EventMetadata } from '../models/event';
import { GameStatus } from '../models/game';
import { BadRequestError, NotFoundError } from '../models/errors';
import { validateEventPayload } from '../utils/event-validation';
import { writeEvent, getEventsByGame } from '../config/dynamodb';
import { applyEventToGame } from '../utils/apply-event-to-game';
import { recalculateStandings } from '../utils/standings-calculation';

/**
 * Event Service
 * Provides business logic for event operations
 */
export class EventService {
  constructor(
    private gameRepository: GameRepository,
    private seasonRepository: SeasonRepository,
    private teamRepository: TeamRepository,
    private standingsRepository: StandingsRepository
  ) {}

  /**
   * Get all events for a game in chronological order
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param gameId - Game identifier
   * @returns Array of events in chronological order
   * @throws NotFoundError if game doesn't exist or doesn't belong to tenant
   */
  async getEventsByGame(tenantId: string, gameId: string): Promise<GameEvent[]> {
    // Validate game exists and belongs to tenant
    const game = await this.gameRepository.findById(tenantId, gameId);
    
    if (!game) {
      throw new NotFoundError('Game not found');
    }
    
    // Fetch events from DynamoDB
    return getEventsByGame(gameId, tenantId);
  }

  /**
   * Create a new event with validation and persistence
   * 
   * This method:
   * 1. Validates game exists and belongs to tenant
   * 2. Prevents event creation for finalized games
   * 3. Validates event payload against event_type schema
   * 4. Writes event to DynamoDB with TTL
   * 5. Applies event to game state in RDS
   * 6. Triggers standings recalculation for GAME_FINALIZED events
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param gameId - Game identifier
   * @param eventType - Type of event to create
   * @param payload - Event-specific payload data
   * @param metadata - Event metadata (user_id, source, etc.)
   * @returns Created event with event_id
   * @throws NotFoundError if game doesn't exist or doesn't belong to tenant
   * @throws BadRequestError if game is finalized or payload is invalid
   */
  async createEvent(
    tenantId: string,
    gameId: string,
    eventType: EventType,
    payload: any,
    metadata: EventMetadata
  ): Promise<GameEvent> {
    // 1. Validate game exists and belongs to tenant
    const game = await this.gameRepository.findById(tenantId, gameId);
    
    if (!game) {
      throw new NotFoundError('Game not found');
    }
    
    // 2. Prevent event creation for finalized games
    if (game.status === GameStatus.FINAL) {
      const error = new BadRequestError('Cannot create events for finalized games');
      (error as any).code = 'GAME_ALREADY_FINALIZED';
      throw error;
    }
    
    // 3. Validate event payload against event_type schema
    validateEventPayload(eventType, payload);
    
    // 4. Write event to DynamoDB with TTL
    const eventParams: CreateEventParams = {
      game_id: gameId,
      tenant_id: tenantId,
      event_type: eventType,
      payload,
      metadata,
    };
    
    const event = await writeEvent(eventParams);
    
    // 5. Apply event to game state in RDS
    await applyEventToGame(tenantId, gameId, event);
    
    // 6. Trigger standings recalculation for GAME_FINALIZED events
    if (eventType === EventType.GAME_FINALIZED) {
      await recalculateStandings(
        tenantId,
        game.season_id,
        this.gameRepository,
        this.standingsRepository,
        this.seasonRepository,
        this.teamRepository
      );
    }
    
    return event;
  }
}
