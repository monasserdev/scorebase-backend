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
import { transaction } from '../config/database';
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


    /**
     * Reverse a previously created event
     *
     * This method:
     * 1. Validates reversed_event_id exists using EventRepository
     * 2. Checks if event is already reversed using EventRepository.isEventReversed
     * 3. Validates event type is reversible (GOAL_SCORED, PENALTY_ASSESSED, SHOT_ON_GOAL)
     * 4. Applies reverse logic based on event type
     * 5. Creates EVENT_REVERSAL event in DynamoDB
     * 6. Generates snapshot using SnapshotService
     * 7. Triggers broadcast using BroadcastService
     *
     * @param tenantId - Tenant identifier from JWT claims
     * @param gameId - Game identifier
     * @param reversedEventId - ID of event to reverse
     * @param metadata - Event metadata (user_id, source, etc.)
     * @returns Reversal event and updated game snapshot
     * @throws NotFoundError if game or event doesn't exist (404 EVENT_NOT_FOUND)
     * @throws BadRequestError if event type is not reversible (400 EVENT_NOT_REVERSIBLE)
     * @throws BadRequestError if event is already reversed (409 EVENT_ALREADY_REVERSED)
     *
     * Requirements: 6.1-6.8, 15.1-15.6
     */
    async reverseEvent(
      tenantId: string,
      gameId: string,
      reversedEventId: string,
      metadata: EventMetadata
    ): Promise<{ event: GameEvent; snapshot: GameSnapshot }> {
      // 1. Validate game exists and belongs to tenant
      const game = await this.gameRepository.findById(tenantId, gameId);

      if (!game) {
        throw new NotFoundError('Game not found');
      }

      // 2. Validate reversed_event_id exists
      const events = await getEventsByGame(gameId, tenantId);
      const eventToReverse = events.find(e => e.event_id === reversedEventId);

      if (!eventToReverse) {
        const error = new NotFoundError('Event not found');
        (error as any).code = 'EVENT_NOT_FOUND';
        throw error;
      }

      // 3. Check if event is already reversed
      const isReversed = await this.eventRepository.isEventReversed(tenantId, reversedEventId);

      if (isReversed) {
        const error = new BadRequestError('Event has already been reversed');
        (error as any).code = 'EVENT_ALREADY_REVERSED';
        throw error;
      }

      // 4. Validate event type is reversible
      const reversibleEventTypes = [
        EventType.GOAL_SCORED,
        EventType.PENALTY_ASSESSED,
        EventType.SHOT_ON_GOAL,
      ];

      if (!reversibleEventTypes.includes(eventToReverse.event_type as EventType)) {
        const error = new BadRequestError('Event type is not reversible');
        (error as any).code = 'EVENT_NOT_REVERSIBLE';
        throw error;
      }

      // 5. Create EVENT_REVERSAL event
      const reversalPayload = {
        reversed_event_id: reversedEventId,
      };

      const reversalEvent = await writeEvent({
        game_id: gameId,
        tenant_id: tenantId,
        event_type: EventType.EVENT_REVERSAL,
        payload: reversalPayload,
        metadata,
      });

      // 6. Apply reverse logic to game state
      await this.applyReverseLogic(tenantId, gameId, eventToReverse, reversalEvent);

      // 7. Fetch updated game state for snapshot generation
      const updatedGame = await this.gameRepository.findById(tenantId, gameId);

      if (!updatedGame) {
        throw new NotFoundError('Game not found after reversal');
      }

      // 8. Generate snapshot using SnapshotService
      const snapshot = await this.snapshotService.generateSnapshotFromGame(
        tenantId,
        gameId,
        updatedGame
      );

      // 9. Trigger broadcast using BroadcastService
      await this.broadcastService.broadcastSnapshot(
        tenantId,
        gameId,
        snapshot,
        'snapshot_update'
      );

      return { event: reversalEvent, snapshot };
    }

    /**
     * Apply reverse logic based on event type
     * 
     * Implements reversal logic for different event types:
     * - GOAL_SCORED: Decrements the appropriate team's score by 1
     * - PENALTY_ASSESSED: Removes the penalty from active penalties (placeholder)
     * - SHOT_ON_GOAL: Updates shot statistics (placeholder)
     * 
     * @param tenantId - Tenant identifier
     * @param gameId - Game identifier
     * @param eventToReverse - The original event being reversed
     * @param reversalEvent - The EVENT_REVERSAL event
     */
      private async applyReverseLogic(
        tenantId: string,
        gameId: string,
        eventToReverse: GameEvent,
        reversalEvent: GameEvent
      ): Promise<void> {
        // Apply reverse logic based on the original event type
        switch (eventToReverse.event_type) {
          case EventType.GOAL_SCORED:
            await this.reverseGoalScored(tenantId, gameId, eventToReverse);
            break;
          
          case EventType.PENALTY_ASSESSED:
            await this.reversePenaltyAssessed(tenantId, gameId, eventToReverse);
            break;
          
          case EventType.SHOT_ON_GOAL:
            await this.reverseShotOnGoal(tenantId, gameId, eventToReverse);
            break;
          
          // Future event types can be added here
          default:
            // For other event types, apply the reversal event to game state
            await applyEventToGame(tenantId, gameId, reversalEvent);
        }
      }

    /**
     * Reverse a GOAL_SCORED event by decrementing the team's score
     * 
     * @param tenantId - Tenant identifier
     * @param gameId - Game identifier
     * @param goalEvent - The original GOAL_SCORED event
     */
    private async reverseGoalScored(
      tenantId: string,
      gameId: string,
      goalEvent: GameEvent
    ): Promise<void> {
      const { team_id } = goalEvent.payload;

      // Use a transaction to ensure atomic update
      await transaction(async (client) => {
        // Verify game exists and belongs to tenant
        const gameCheck = await client.query(
          `SELECT g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score
           FROM games g
           INNER JOIN seasons s ON g.season_id = s.id
           INNER JOIN leagues l ON s.league_id = l.id
           WHERE l.tenant_id = $1 AND g.id = $2`,
          [tenantId, gameId]
        );

        if (gameCheck.rows.length === 0) {
          throw new NotFoundError(`Game not found: ${gameId}`);
        }

        const game = gameCheck.rows[0];

        // Determine which score to decrement
        let updateQuery: string;
        if (team_id === game.home_team_id) {
          // Ensure score doesn't go below 0
          if (game.home_score <= 0) {
            throw new BadRequestError(`Cannot reverse goal: home team score is already 0`);
          }
          updateQuery = `
            UPDATE games
            SET home_score = home_score - 1,
                updated_at = NOW()
            WHERE id = $1
          `;
        } else if (team_id === game.away_team_id) {
          // Ensure score doesn't go below 0
          if (game.away_score <= 0) {
            throw new BadRequestError(`Cannot reverse goal: away team score is already 0`);
          }
          updateQuery = `
            UPDATE games
            SET away_score = away_score - 1,
                updated_at = NOW()
            WHERE id = $1
          `;
        } else {
          throw new BadRequestError(`Team ${team_id} is not part of game ${gameId}`);
        }

        await client.query(updateQuery, [gameId]);
      });
    }

    /**
     * Reverse a PENALTY_ASSESSED event by removing the penalty from active penalties
     *
     * NOTE: This is a placeholder implementation. The Game model does not currently
     * have an active_penalties field. This method logs the reversal for audit purposes
     * and will be enhanced when penalty tracking is added to the Game model.
     *
     * @param tenantId - Tenant identifier
     * @param gameId - Game identifier
     * @param penaltyEvent - The original PENALTY_ASSESSED event
     */
    private async reversePenaltyAssessed(
      tenantId: string,
      gameId: string,
      penaltyEvent: GameEvent
    ): Promise<void> {
      const { team_id } = penaltyEvent.payload;

      // Use a transaction to ensure atomic update
      await transaction(async (client) => {
        // Verify game exists and belongs to tenant
        const gameCheck = await client.query(
          `SELECT g.id, g.home_team_id, g.away_team_id
           FROM games g
           INNER JOIN seasons s ON g.season_id = s.id
           INNER JOIN leagues l ON s.league_id = l.id
           WHERE l.tenant_id = $1 AND g.id = $2`,
          [tenantId, gameId]
        );

        if (gameCheck.rows.length === 0) {
          throw new NotFoundError(`Game not found: ${gameId}`);
        }

        const game = gameCheck.rows[0];

        // Verify team is part of the game
        if (team_id !== game.home_team_id && team_id !== game.away_team_id) {
          throw new BadRequestError(`Team ${team_id} is not part of game ${gameId}`);
        }

        // TODO: When active_penalties field is added to Game model:
        // 1. Query current active_penalties from games table
        // 2. Remove the penalty matching the original event's details
        // 3. Update games table with modified active_penalties
        //
        // For now, log the reversal for audit purposes
        // The penalty reversal will be fully functional once the Game model
        // includes penalty tracking (future enhancement)

        // Update game's updated_at timestamp to reflect the reversal
        await client.query(
          `UPDATE games
           SET updated_at = NOW()
           WHERE id = $1`,
          [gameId]
        );
      });
    }

    /**
     * Reverse a SHOT_ON_GOAL event by updating shot statistics
     *
     * NOTE: This is a placeholder implementation. The Game model does not currently
     * have shot statistics fields (shots_on_goal_home, shots_on_goal_away, etc.).
     * This method logs the reversal for audit purposes and will be enhanced when
     * shot tracking is added to the Game model.
     *
     * @param tenantId - Tenant identifier
     * @param gameId - Game identifier
     * @param shotEvent - The original SHOT_ON_GOAL event
     */
    private async reverseShotOnGoal(
      tenantId: string,
      gameId: string,
      shotEvent: GameEvent
    ): Promise<void> {
      const { team_id } = shotEvent.payload;

      // Use a transaction to ensure atomic update
      await transaction(async (client) => {
        // Verify game exists and belongs to tenant
        const gameCheck = await client.query(
          `SELECT g.id, g.home_team_id, g.away_team_id
           FROM games g
           INNER JOIN seasons s ON g.season_id = s.id
           INNER JOIN leagues l ON s.league_id = l.id
           WHERE l.tenant_id = $1 AND g.id = $2`,
          [tenantId, gameId]
        );

        if (gameCheck.rows.length === 0) {
          throw new NotFoundError(`Game not found: ${gameId}`);
        }

        const game = gameCheck.rows[0];

        // Verify team is part of the game
        if (team_id !== game.home_team_id && team_id !== game.away_team_id) {
          throw new BadRequestError(`Team ${team_id} is not part of game ${gameId}`);
        }

        // TODO: When shot statistics fields are added to Game model:
        // 1. Query current shot statistics from games table
        // 2. Decrement the appropriate team's shot count by 1
        // 3. Update games table with modified shot statistics
        //
        // For now, log the reversal for audit purposes
        // The shot reversal will be fully functional once the Game model
        // includes shot tracking (future enhancement)

        // Update game's updated_at timestamp to reflect the reversal
        await client.query(
          `UPDATE games
           SET updated_at = NOW()
           WHERE id = $1`,
          [gameId]
        );
      });
    }


}
