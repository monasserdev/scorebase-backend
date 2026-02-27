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
import { EventRepository } from '../repositories/event-repository';
import { GameEvent, CreateEventParams, EventType, EventMetadata, EventPayload } from '../models/event';
import { GameStatus } from '../models/game';
import { GameSnapshot } from '../models/snapshot';
import { BadRequestError, NotFoundError } from '../models/errors';
import { validateEventPayload } from '../utils/event-validation';
import { validateSpatialCoordinates } from '../utils/spatial-coordinate-validation';
import { writeEvent, getEventsByGame } from '../config/dynamodb';
import { applyEventToGame } from '../utils/apply-event-to-game';
import { recalculateStandings } from '../utils/standings-calculation';
import { SnapshotService } from './snapshot-service';
import { BroadcastService } from './broadcast-service';

/**
 * Event Service
 * Provides business logic for event operations
 */
export class EventService {
  constructor(
    private gameRepository: GameRepository,
    private seasonRepository: SeasonRepository,
    private teamRepository: TeamRepository,
    private standingsRepository: StandingsRepository,
    private eventRepository: EventRepository,
    private snapshotService: SnapshotService,
    private broadcastService: BroadcastService
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

  /**
   * Create event with snapshot generation and broadcast
   * 
   * This method provides the complete event creation flow for scorekeeper operations:
   * 1. Validates spatial coordinates if present in payload
   * 2. Checks idempotency_key for duplicate prevention
   * 3. Validates occurred_at timestamp if provided (not in future, within 24 hours)
   * 4. Validates game exists and belongs to tenant
   * 5. Prevents event creation for finalized games
   * 6. Validates event payload against event_type schema
   * 7. Preserves client-provided occurred_at timestamp for offline events
   * 8. Writes event to DynamoDB with TTL
   * 9. Applies event to game state in RDS
   * 10. Generates snapshot using SnapshotService
   * 11. Triggers broadcast using BroadcastService
   * 12. Triggers standings recalculation for GAME_FINALIZED events
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param gameId - Game identifier
   * @param eventType - Type of event to create
   * @param payload - Event-specific payload data
   * @param metadata - Event metadata (user_id, source, etc.)
   * @param options - Optional parameters for idempotency and offline events
   * @returns Created event and generated snapshot
   * @throws NotFoundError if game doesn't exist or doesn't belong to tenant
   * @throws BadRequestError if game is finalized, payload is invalid, timestamp is invalid, or duplicate idempotency_key
   * 
   * Requirements: 1.1-1.5, 2.1, 7.1, 7.2, 7.3, 7.4, 9.4, 13.1-13.3
   */
  async createEventWithSnapshot(
    tenantId: string,
    gameId: string,
    eventType: EventType,
    payload: EventPayload,
    metadata: EventMetadata,
    options?: {
      occurred_at?: string;
      idempotency_key?: string;
    }
  ): Promise<{ event: GameEvent; snapshot: GameSnapshot }> {
    // 1. Validate spatial coordinates if present in payload
    if (payload.spatial_coordinates) {
      const validationResult = validateSpatialCoordinates(payload.spatial_coordinates);
      if (!validationResult.valid) {
        const error = new BadRequestError('Invalid spatial coordinates');
        (error as any).code = 'INVALID_SPATIAL_COORDINATES';
        (error as any).details = validationResult.errors;
        throw error;
      }
    }

    // 2. Check idempotency_key for duplicates
    if (options?.idempotency_key) {
      const existingEvent = await this.eventRepository.findByIdempotencyKey(
        tenantId,
        options.idempotency_key
      );

      if (existingEvent) {
        // Duplicate request - fetch the updated game state and generate snapshot
        const game = await this.gameRepository.findById(tenantId, gameId);
        if (!game) {
          throw new NotFoundError('Game not found');
        }

        const snapshot = await this.snapshotService.generateSnapshotFromGame(
          tenantId,
          gameId,
          game
        );

        // Return existing event with current snapshot (200 response)
        return { event: existingEvent, snapshot };
      }
    }

    // 2.5. Validate offline timestamp if provided
    if (options?.occurred_at) {
      const occurredAt = new Date(options.occurred_at);
      const now = new Date();
      
      // Validate timestamp is not in the future
      if (occurredAt > now) {
        const error = new BadRequestError('Event timestamp cannot be in the future');
        (error as any).code = 'INVALID_TIMESTAMP';
        (error as any).details = {
          occurred_at: options.occurred_at,
          reason: 'Timestamp is in the future'
        };
        throw error;
      }
      
      // Validate timestamp is within 24 hours
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (occurredAt < twentyFourHoursAgo) {
        const error = new BadRequestError('Event timestamp must be within 24 hours');
        (error as any).code = 'INVALID_TIMESTAMP';
        (error as any).details = {
          occurred_at: options.occurred_at,
          reason: 'Timestamp is more than 24 hours old'
        };
        throw error;
      }
    }

    // 3. Validate game exists and belongs to tenant
    const game = await this.gameRepository.findById(tenantId, gameId);
    
    if (!game) {
      throw new NotFoundError('Game not found');
    }
    
    // 4. Prevent event creation for finalized games
    if (game.status === GameStatus.FINAL) {
      const error = new BadRequestError('Cannot create events for finalized games');
      (error as any).code = 'GAME_ALREADY_FINALIZED';
      throw error;
    }
    
    // 5. Validate event payload against event_type schema
    validateEventPayload(eventType, payload);
    
    // 6. Write event to DynamoDB with optional occurred_at and idempotency_key
    const eventParams: CreateEventParams = {
      game_id: gameId,
      tenant_id: tenantId,
      event_type: eventType,
      payload,
      metadata,
    };
    
    const event = await writeEvent(eventParams, {
      occurred_at: options?.occurred_at,
      idempotency_key: options?.idempotency_key,
      spatial_coordinates: payload.spatial_coordinates,
    });
    
    // 7. Apply event to game state in RDS
    await applyEventToGame(tenantId, gameId, event);
    
    // 8. Fetch updated game state for snapshot generation
    const updatedGame = await this.gameRepository.findById(tenantId, gameId);
    
    if (!updatedGame) {
      throw new NotFoundError('Game not found after update');
    }
    
    // 9. Generate snapshot using SnapshotService
    const snapshot = await this.snapshotService.generateSnapshotFromGame(
      tenantId,
      gameId,
      updatedGame
    );
    
    // 10. Trigger broadcast using BroadcastService
    await this.broadcastService.broadcastSnapshot(
      tenantId,
      gameId,
      snapshot,
      'snapshot_update'
    );
    
    // 11. Trigger standings recalculation for GAME_FINALIZED events
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
    
    return { event, snapshot };
  }
}
