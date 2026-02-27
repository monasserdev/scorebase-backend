/**
 * Snapshot Service
 * 
 * Business logic layer for game snapshot generation.
 * Generates complete game state snapshots from RDS game state and recent DynamoDB events.
 * Implements performance monitoring to ensure <200ms target for snapshot generation.
 * 
 * Requirements: 2.1-2.7, 3.1, 3.2, 8.1, 8.2
 */

import { GameRepository } from '../repositories/game-repository';
import { getEventsByGame } from '../config/dynamodb';
import { GameSnapshot } from '../models/snapshot';
import { Game, GameStatus } from '../models/game';
import { NotFoundError } from '../models/errors';
import { log, LogLevel } from '../utils/logger';

/**
 * Snapshot schema version
 */
const SNAPSHOT_VERSION = '1.0';

/**
 * Number of recent events to include in snapshot
 */
const RECENT_EVENTS_LIMIT = 10;

/**
 * Snapshot Service
 * Provides business logic for game snapshot generation
 */
export class SnapshotService {
  constructor(private gameRepository: GameRepository) {}

  /**
   * Generate a complete game snapshot
   * 
   * Fetches current game state from RDS and recent events from DynamoDB,
   * then constructs a complete snapshot for client synchronization.
   * 
   * Performance target: <200ms at p95
   * 
   * @param tenantId - Tenant identifier for multi-tenant isolation
   * @param gameId - Game identifier
   * @returns Complete game snapshot with scores, period, clock, status, and recent events
   * @throws NotFoundError if game doesn't exist
   * @throws ForbiddenError if game doesn't belong to tenant
   * 
   * Requirements: 2.1-2.7, 3.1, 3.2, 8.1, 8.2
   */
  async generateSnapshot(tenantId: string, gameId: string): Promise<GameSnapshot> {
    const startTime = Date.now();

    try {
      // Fetch game from RDS (validates tenant ownership)
      const game = await this.gameRepository.findById(tenantId, gameId);

      if (!game) {
        throw new NotFoundError('Game not found');
      }

      // Generate snapshot from game state
      const snapshot = await this.generateSnapshotFromGame(tenantId, gameId, game);

      // Log performance
      const duration = Date.now() - startTime;
      log(LogLevel.INFO, 'Snapshot generated', {
        tenant_id: tenantId,
        game_id: gameId,
        duration_ms: duration,
        operation: 'generateSnapshot',
      });

      return snapshot;
    } catch (error) {
      const duration = Date.now() - startTime;
      log(LogLevel.ERROR, 'Snapshot generation failed', {
        tenant_id: tenantId,
        game_id: gameId,
        duration_ms: duration,
        operation: 'generateSnapshot',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate snapshot after event creation (optimized path)
   * 
   * Uses provided game state to avoid duplicate RDS query.
   * This is an optimization for the event creation flow where the game
   * state has already been fetched and updated.
   * 
   * Performance target: <200ms at p95
   * 
   * @param tenantId - Tenant identifier
   * @param gameId - Game identifier
   * @param updatedGame - Already-updated game state from event processing
   * @returns Game snapshot using provided game state
   * 
   * Requirements: 2.1-2.7, 8.1, 8.2
   */
  async generateSnapshotFromGame(
    tenantId: string,
    gameId: string,
    updatedGame: Game
  ): Promise<GameSnapshot> {
    const startTime = Date.now();

    try {
      // Fetch 10 most recent events from DynamoDB
      const allEvents = await getEventsByGame(gameId, tenantId);

      // Sort events by occurred_at descending and take the 10 most recent
      const recentEvents = allEvents
        .sort((a, b) => {
          // Sort by occurred_at timestamp in descending order (newest first)
          return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
        })
        .slice(0, RECENT_EVENTS_LIMIT);

      // Map game status to snapshot status format
      const snapshotStatus = this.mapGameStatusToSnapshotStatus(updatedGame.status);

      // Construct snapshot
      const snapshot: GameSnapshot = {
        game_id: gameId,
        home_score: updatedGame.home_score,
        away_score: updatedGame.away_score,
        period: this.extractPeriodFromGame(updatedGame),
        clock_seconds: this.extractClockSecondsFromGame(updatedGame),
        status: snapshotStatus,
        recent_events: recentEvents,
        snapshot_version: SNAPSHOT_VERSION,
        generated_at: new Date().toISOString(),
      };

      // Log performance
      const duration = Date.now() - startTime;
      log(LogLevel.INFO, 'Snapshot generated from game', {
        tenant_id: tenantId,
        game_id: gameId,
        duration_ms: duration,
        operation: 'generateSnapshotFromGame',
        recent_events_count: recentEvents.length,
      });

      return snapshot;
    } catch (error) {
      const duration = Date.now() - startTime;
      log(LogLevel.ERROR, 'Snapshot generation from game failed', {
        tenant_id: tenantId,
        game_id: gameId,
        duration_ms: duration,
        operation: 'generateSnapshotFromGame',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Map GameStatus to snapshot status format
   * 
   * @param status - Game status from database
   * @returns Snapshot status string
   */
  private mapGameStatusToSnapshotStatus(
    status: GameStatus
  ): 'scheduled' | 'in_progress' | 'final' | 'postponed' {
    switch (status) {
      case GameStatus.SCHEDULED:
        return 'scheduled';
      case GameStatus.LIVE:
        return 'in_progress';
      case GameStatus.FINAL:
        return 'final';
      case GameStatus.POSTPONED:
        return 'postponed';
      case GameStatus.CANCELLED:
        // Map cancelled to postponed for snapshot compatibility
        return 'postponed';
      default:
        return 'scheduled';
    }
  }

  /**
   * Extract period number from game state
   * 
   * For now, returns a default value since the Game model doesn't include period.
   * This will be enhanced when game state tracking is implemented.
   * 
   * @param _game - Game entity (unused for now)
   * @returns Period number (default: 1)
   */
  private extractPeriodFromGame(_game: Game): number {
    // TODO: Extract from game state when period tracking is implemented
    // For now, return default value
    return 1;
  }

  /**
   * Extract clock seconds from game state
   * 
   * For now, returns a default value since the Game model doesn't include clock.
   * This will be enhanced when game state tracking is implemented.
   * 
   * @param _game - Game entity (unused for now)
   * @returns Clock time in seconds (default: 0)
   */
  private extractClockSecondsFromGame(_game: Game): number {
    // TODO: Extract from game state when clock tracking is implemented
    // For now, return default value
    return 0;
  }
}
