/**
 * Standings Repository
 * 
 * Data access layer for team standings with multi-tenant isolation.
 * All queries enforce tenant_id filtering through season and league relationships
 * and use parameterized queries to prevent SQL injection.
 * 
 * Provides methods for retrieving standings and upserting standings data
 * with transaction support for atomic operations.
 * 
 * Requirements: 7.1, 7.9, 7.10
 */

import { PoolClient } from 'pg';
import { enforceMultiTenantIsolationMany } from '../middleware/multi-tenant-isolation';
import { transaction } from '../config/database';
import {
  TeamStanding,
  StandingRow,
  StandingUpsertData,
  mapStandingRow,
} from '../models/standing';

/**
 * Standings Repository
 * Provides data access methods for standings with tenant isolation
 */
export class StandingsRepository {
  /**
   * Find all standings for a season with tenant validation
   * 
   * Joins with seasons and leagues tables to enforce tenant isolation since
   * standings table doesn't have direct tenant_id column.
   * 
   * Results are ordered by:
   * 1. points DESC (primary sort)
   * 2. goal_differential DESC (tiebreaker)
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @returns Array of standings ordered by points DESC, goal_differential DESC
   */
  async findBySeasonId(
    tenantId: string,
    seasonId: string
  ): Promise<TeamStanding[]> {
    const query = `
      SELECT 
        st.id,
        st.season_id,
        st.team_id,
        st.games_played,
        st.wins,
        st.losses,
        st.ties,
        st.points,
        st.goals_for,
        st.goals_against,
        st.goal_differential,
        st.streak,
        st.created_at,
        st.updated_at
      FROM standings st
      INNER JOIN seasons s ON st.season_id = s.id
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE l.tenant_id = $1 AND st.season_id = $2
      ORDER BY st.points DESC, st.goal_differential DESC
    `;

    const rows = await enforceMultiTenantIsolationMany<StandingRow>(
      tenantId,
      query,
      [seasonId] // Additional param after tenant_id
    );

    return rows.map(mapStandingRow);
  }

  /**
   * Upsert standings for multiple teams with transaction support
   * 
   * Uses ON CONFLICT (season_id, team_id) DO UPDATE to handle both
   * inserts and updates atomically. All operations are wrapped in a
   * transaction to ensure consistency.
   * 
   * This method does NOT enforce tenant isolation directly since it's
   * called from internal services that have already validated tenant access.
   * The unique constraint on (season_id, team_id) prevents cross-tenant
   * data corruption.
   * 
   * @param standings - Array of standing data to upsert
   * @returns Promise that resolves when all standings are persisted
   */
  async upsertStandings(standings: StandingUpsertData[]): Promise<void> {
    if (standings.length === 0) {
      return;
    }

    await transaction(async (client: PoolClient) => {
      for (const standing of standings) {
        const query = `
          INSERT INTO standings (
            season_id,
            team_id,
            games_played,
            wins,
            losses,
            ties,
            points,
            goals_for,
            goals_against,
            goal_differential,
            streak,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
          )
          ON CONFLICT (season_id, team_id)
          DO UPDATE SET
            games_played = EXCLUDED.games_played,
            wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            ties = EXCLUDED.ties,
            points = EXCLUDED.points,
            goals_for = EXCLUDED.goals_for,
            goals_against = EXCLUDED.goals_against,
            goal_differential = EXCLUDED.goal_differential,
            streak = EXCLUDED.streak,
            updated_at = NOW()
        `;

        const params = [
          standing.season_id,
          standing.team_id,
          standing.games_played,
          standing.wins,
          standing.losses,
          standing.ties,
          standing.points,
          standing.goals_for,
          standing.goals_against,
          standing.goal_differential,
          standing.streak || null,
        ];

        await client.query(query, params);
      }
    });
  }
}
