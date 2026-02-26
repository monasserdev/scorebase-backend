/**
 * Apply Event to Game Module
 * 
 * Updates game state in RDS based on event type using database transactions.
 * Called after event is persisted to DynamoDB to maintain consistency.
 * 
 * Requirements: 6.7, 6.8
 */

import { PoolClient } from 'pg';
import { transaction } from '../config/database';
import { EventType, GameEvent } from '../models/event';
import { GameStatus } from '../models/game';
import { NotFoundError, BadRequestError } from '../models/errors';

/**
 * Apply an event to update game state in RDS
 * 
 * Handles different event types:
 * - GOAL_SCORED: Increments appropriate team score
 * - GAME_STARTED: Sets status to 'live'
 * - GAME_FINALIZED: Sets status to 'final' and updates final scores
 * - GAME_CANCELLED: Sets status to 'cancelled'
 * 
 * Uses database transactions for atomic updates.
 * 
 * @param tenantId - Tenant identifier for validation
 * @param gameId - Game identifier
 * @param event - The event to apply
 * @throws Error if game not found or update fails
 */
export async function applyEventToGame(
  tenantId: string,
  gameId: string,
  event: GameEvent
): Promise<void> {
  await transaction(async (client: PoolClient) => {
    // Verify game exists and belongs to tenant
    const gameCheck = await client.query(
      `SELECT g.id, g.status, g.home_team_id, g.away_team_id, g.home_score, g.away_score
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

    // Apply event based on type
    switch (event.event_type) {
      case EventType.GOAL_SCORED:
        await handleGoalScored(client, gameId, game, event);
        break;

      case EventType.GAME_STARTED:
        await handleGameStarted(client, gameId);
        break;

      case EventType.GAME_FINALIZED:
        await handleGameFinalized(client, gameId, event);
        break;

      case EventType.GAME_CANCELLED:
        await handleGameCancelled(client, gameId);
        break;

      // Other event types don't modify game state
      case EventType.PENALTY_ASSESSED:
      case EventType.PERIOD_ENDED:
      case EventType.SCORE_CORRECTED:
        // No game state changes needed
        break;

      default:
        // Unknown event type - log but don't fail
        console.warn(`Unknown event type: ${event.event_type}`);
    }
  });
}

/**
 * Handle GOAL_SCORED event - increment appropriate team score
 */
async function handleGoalScored(
  client: PoolClient,
  gameId: string,
  game: any,
  event: GameEvent
): Promise<void> {
  const { team_id } = event.payload;

  // Determine which score to increment
  let updateQuery: string;
  if (team_id === game.home_team_id) {
    updateQuery = `
      UPDATE games
      SET home_score = home_score + 1,
          updated_at = NOW()
      WHERE id = $1
    `;
  } else if (team_id === game.away_team_id) {
    updateQuery = `
      UPDATE games
      SET away_score = away_score + 1,
          updated_at = NOW()
      WHERE id = $1
    `;
  } else {
    throw new BadRequestError(`Team ${team_id} is not part of game ${gameId}`);
  }

  await client.query(updateQuery, [gameId]);
}

/**
 * Handle GAME_STARTED event - set status to 'live'
 */
async function handleGameStarted(
  client: PoolClient,
  gameId: string
): Promise<void> {
  await client.query(
    `UPDATE games
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [GameStatus.LIVE, gameId]
  );
}

/**
 * Handle GAME_FINALIZED event - set status to 'final' and update final scores
 */
async function handleGameFinalized(
  client: PoolClient,
  gameId: string,
  event: GameEvent
): Promise<void> {
  const { final_home_score, final_away_score } = event.payload;

  await client.query(
    `UPDATE games
     SET status = $1,
         home_score = $2,
         away_score = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [GameStatus.FINAL, final_home_score, final_away_score, gameId]
  );
}

/**
 * Handle GAME_CANCELLED event - set status to 'cancelled'
 */
async function handleGameCancelled(
  client: PoolClient,
  gameId: string
): Promise<void> {
  await client.query(
    `UPDATE games
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [GameStatus.CANCELLED, gameId]
  );
}
