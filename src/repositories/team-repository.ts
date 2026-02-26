/**
 * Team Repository
 * 
 * Data access layer for teams with multi-tenant isolation.
 * All queries enforce tenant_id filtering through league relationships
 * and use parameterized queries to prevent SQL injection.
 * 
 * Requirements: 4.1, 4.2
 */

import {
  enforceMultiTenantIsolationMany,
  enforceMultiTenantIsolationSingle,
} from '../middleware/multi-tenant-isolation';
import { Team, TeamRow, mapTeamRow } from '../models/team';

/**
 * Team Repository
 * Provides data access methods for teams with tenant isolation
 */
export class TeamRepository {
  /**
   * Find all teams for a league with tenant validation
   * 
   * Joins with leagues table to enforce tenant isolation since
   * teams table has tenant_id but we validate through league relationship.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns Array of teams belonging to the league
   */
  async findByLeagueId(tenantId: string, leagueId: string): Promise<Team[]> {
    const query = `
      SELECT 
        t.id,
        t.tenant_id,
        t.league_id,
        t.name,
        t.abbreviation,
        t.logo_url,
        t.primary_color,
        t.secondary_color,
        t.created_at,
        t.updated_at
      FROM teams t
      INNER JOIN leagues l ON t.league_id = l.id
      WHERE l.tenant_id = $1 AND t.league_id = $2
      ORDER BY t.name ASC
    `;

    const rows = await enforceMultiTenantIsolationMany<TeamRow>(
      tenantId,
      query,
      [leagueId] // Additional param after tenant_id
    );

    return rows.map(mapTeamRow);
  }

  /**
   * Find a team by ID with tenant validation
   * 
   * Joins with leagues table to enforce tenant isolation.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param teamId - Team identifier
   * @returns Team if found and belongs to tenant, null otherwise
   */
  async findById(tenantId: string, teamId: string): Promise<Team | null> {
    const query = `
      SELECT 
        t.id,
        t.tenant_id,
        t.league_id,
        t.name,
        t.abbreviation,
        t.logo_url,
        t.primary_color,
        t.secondary_color,
        t.created_at,
        t.updated_at
      FROM teams t
      INNER JOIN leagues l ON t.league_id = l.id
      WHERE l.tenant_id = $1 AND t.id = $2
    `;

    const row = await enforceMultiTenantIsolationSingle<TeamRow>(
      tenantId,
      query,
      [teamId] // Additional param after tenant_id
    );

    return row ? mapTeamRow(row) : null;
  }
}
