/**
 * Database Connection Pool Usage Examples
 * 
 * This file demonstrates how to use the database connection pool module
 * for common database operations in the ScoreBase backend.
 */

import { query, transaction } from './database';
import { PoolClient } from 'pg';

/**
 * Example 1: Simple parameterized query
 * Always use parameterized queries to prevent SQL injection
 */
export async function getLeaguesByTenant(tenantId: string) {
  const result = await query(
    'SELECT * FROM leagues WHERE tenant_id = $1',
    [tenantId]
  );
  return result.rows;
}

/**
 * Example 2: Query with multiple parameters
 */
export async function getGamesBySeasonAndStatus(
  tenantId: string,
  seasonId: string,
  status: string
) {
  const result = await query(
    `SELECT * FROM games 
     WHERE tenant_id = $1 
     AND season_id = $2 
     AND status = $3
     ORDER BY scheduled_at DESC`,
    [tenantId, seasonId, status]
  );
  return result.rows;
}

/**
 * Example 3: Transaction with multiple operations
 * Use transactions when you need atomic operations
 */
export async function createGameWithTeams(
  tenantId: string,
  gameData: any,
  homeTeamId: string,
  awayTeamId: string
) {
  return transaction(async (client: PoolClient) => {
    // Insert game
    const gameResult = await client.query(
      `INSERT INTO games (tenant_id, season_id, home_team_id, away_team_id, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        tenantId,
        gameData.seasonId,
        homeTeamId,
        awayTeamId,
        gameData.scheduledAt,
        'scheduled',
      ]
    );

    const game = gameResult.rows[0];

    // Update team statistics
    await client.query(
      `UPDATE teams 
       SET games_scheduled = games_scheduled + 1
       WHERE tenant_id = $1 AND id IN ($2, $3)`,
      [tenantId, homeTeamId, awayTeamId]
    );

    return game;
  });
}

/**
 * Example 4: Transaction with rollback on error
 * If any operation fails, all changes are rolled back automatically
 */
export async function updateGameScore(
  tenantId: string,
  gameId: string,
  homeScore: number,
  awayScore: number
) {
  return transaction(async (client: PoolClient) => {
    // Verify game exists and belongs to tenant
    const gameCheck = await client.query(
      'SELECT * FROM games WHERE tenant_id = $1 AND id = $2',
      [tenantId, gameId]
    );

    if (gameCheck.rows.length === 0) {
      throw new Error('Game not found');
    }

    const game = gameCheck.rows[0];

    if (game.status === 'final') {
      throw new Error('Cannot update score for finalized game');
    }

    // Update game score
    const result = await client.query(
      `UPDATE games 
       SET home_score = $1, away_score = $2, status = 'live'
       WHERE tenant_id = $3 AND id = $4
       RETURNING *`,
      [homeScore, awayScore, tenantId, gameId]
    );

    return result.rows[0];
  });
}

/**
 * Example 5: Bulk insert with transaction
 */
export async function createMultiplePlayers(
  tenantId: string,
  teamId: string,
  players: Array<{ name: string; position: string; jerseyNumber: number }>
) {
  return transaction(async (client: PoolClient) => {
    const insertedPlayers = [];

    for (const player of players) {
      const result = await client.query(
        `INSERT INTO players (tenant_id, team_id, name, position, jersey_number)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, teamId, player.name, player.position, player.jerseyNumber]
      );
      insertedPlayers.push(result.rows[0]);
    }

    return insertedPlayers;
  });
}

/**
 * Example 6: Complex query with JOIN
 */
export async function getStandingsWithTeamInfo(
  tenantId: string,
  seasonId: string
) {
  const result = await query(
    `SELECT 
       s.team_id,
       t.name as team_name,
       t.logo_url,
       s.games_played,
       s.wins,
       s.losses,
       s.ties,
       s.points,
       s.goals_for,
       s.goals_against,
       s.goal_differential,
       s.streak
     FROM standings s
     JOIN teams t ON s.team_id = t.id
     WHERE s.tenant_id = $1 AND s.season_id = $2
     ORDER BY s.points DESC, s.goal_differential DESC`,
    [tenantId, seasonId]
  );
  return result.rows;
}
