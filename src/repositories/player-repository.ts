/**
 * Player Repository
 * 
 * Data access layer for players with multi-tenant isolation.
 * All queries enforce tenant_id filtering through team and league relationships
 * and use parameterized queries to prevent SQL injection.
 * 
 * Requirements: 4.3, 4.4
 */

import {
  enforceMultiTenantIsolationMany,
  enforceMultiTenantIsolationSingle,
} from '../middleware/multi-tenant-isolation';
import { Player, PlayerRow, mapPlayerRow } from '../models/player';

/**
 * Player Repository
 * Provides data access methods for players with tenant isolation
 */
export class PlayerRepository {
  /**
   * Find all players for a team with tenant validation
   * 
   * Joins with teams and leagues tables to enforce tenant isolation since
   * players table doesn't have tenant_id but we validate through team->league relationship.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param teamId - Team identifier
   * @returns Array of players belonging to the team
   */
  async findByTeamId(tenantId: string, teamId: string): Promise<Player[]> {
    const query = `
      SELECT 
        p.id,
        p.team_id,
        p.first_name,
        p.last_name,
        p.jersey_number,
        p.position,
        p.created_at,
        p.updated_at
      FROM players p
      INNER JOIN teams t ON p.team_id = t.id
      INNER JOIN leagues l ON t.league_id = l.id
      WHERE l.tenant_id = $1 AND p.team_id = $2
      ORDER BY p.last_name ASC, p.first_name ASC
    `;

    const rows = await enforceMultiTenantIsolationMany<PlayerRow>(
      tenantId,
      query,
      [teamId] // Additional param after tenant_id
    );

    return rows.map(mapPlayerRow);
  }

  /**
   * Find a player by ID with tenant validation
   * 
   * Joins with teams and leagues tables to enforce tenant isolation.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param playerId - Player identifier
   * @returns Player if found and belongs to tenant, null otherwise
   */
  async findById(tenantId: string, playerId: string): Promise<Player | null> {
    const query = `
      SELECT 
        p.id,
        p.team_id,
        p.first_name,
        p.last_name,
        p.jersey_number,
        p.position,
        p.created_at,
        p.updated_at
      FROM players p
      INNER JOIN teams t ON p.team_id = t.id
      INNER JOIN leagues l ON t.league_id = l.id
      WHERE l.tenant_id = $1 AND p.id = $2
    `;

    const row = await enforceMultiTenantIsolationSingle<PlayerRow>(
      tenantId,
      query,
      [playerId] // Additional param after tenant_id
    );

    return row ? mapPlayerRow(row) : null;
  }
}
