/**
 * Game Repository
 * 
 * Data access layer for games with multi-tenant isolation.
 * All queries enforce tenant_id filtering through season and league relationships
 * and use parameterized queries to prevent SQL injection.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {
  enforceMultiTenantIsolationMany,
  enforceMultiTenantIsolationSingle,
} from '../middleware/multi-tenant-isolation';
import { Game, GameRow, GameFilters, mapGameRow } from '../models/game';

/**
 * Game Repository
 * Provides data access methods for games with tenant isolation
 */
export class GameRepository {
  /**
   * Find all games for a season with optional filters and tenant validation
   * 
   * Joins with seasons and leagues tables to enforce tenant isolation since
   * games table doesn't have direct tenant_id column.
   * 
   * Supports filtering by:
   * - status: Filter by game status (scheduled, live, final, postponed, cancelled)
   * - startDate/endDate: Filter by scheduled_at date range
   * - teamId: Filter by team (home or away)
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @param filters - Optional filters for status, date range, and team
   * @returns Array of games belonging to the season
   */
  async findBySeasonId(
    tenantId: string,
    seasonId: string,
    filters?: GameFilters
  ): Promise<Game[]> {
    // Build dynamic WHERE clause based on filters
    const conditions: string[] = ['l.tenant_id = $1', 'g.season_id = $2'];
    const params: any[] = [seasonId]; // Additional params after tenant_id

    let paramIndex = 3; // Start at $3 since $1 is tenant_id, $2 is season_id

    // Add status filter
    if (filters?.status) {
      conditions.push(`g.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    // Add date range filters
    if (filters?.startDate) {
      conditions.push(`g.scheduled_at >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      conditions.push(`g.scheduled_at <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    // Add team filter (home or away)
    if (filters?.teamId) {
      conditions.push(`(g.home_team_id = $${paramIndex} OR g.away_team_id = $${paramIndex})`);
      params.push(filters.teamId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT 
        g.id,
        g.season_id,
        g.home_team_id,
        g.away_team_id,
        g.scheduled_at,
        g.status,
        g.home_score,
        g.away_score,
        g.location,
        g.created_at,
        g.updated_at
      FROM games g
      INNER JOIN seasons s ON g.season_id = s.id
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE ${whereClause}
      ORDER BY g.scheduled_at ASC
    `;

    const rows = await enforceMultiTenantIsolationMany<GameRow>(
      tenantId,
      query,
      params
    );

    return rows.map(mapGameRow);
  }

  /**
   * Find a game by ID with tenant validation
   * 
   * Joins with seasons and leagues tables to enforce tenant isolation since
   * games table doesn't have direct tenant_id column.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param gameId - Game identifier
   * @returns Game if found and belongs to tenant, null otherwise
   */
  async findById(tenantId: string, gameId: string): Promise<Game | null> {
    const query = `
      SELECT 
        g.id,
        g.season_id,
        g.home_team_id,
        g.away_team_id,
        g.scheduled_at,
        g.status,
        g.home_score,
        g.away_score,
        g.location,
        g.created_at,
        g.updated_at
      FROM games g
      INNER JOIN seasons s ON g.season_id = s.id
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE l.tenant_id = $1 AND g.id = $2
    `;

    const row = await enforceMultiTenantIsolationSingle<GameRow>(
      tenantId,
      query,
      [gameId] // Additional param after tenant_id
    );

    return row ? mapGameRow(row) : null;
  }
}
