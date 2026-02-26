/**
 * Season Repository
 * 
 * Data access layer for seasons with multi-tenant isolation.
 * All queries enforce tenant_id filtering through league relationships
 * and use parameterized queries to prevent SQL injection.
 * 
 * Requirements: 3.3, 3.4
 */

import {
  enforceMultiTenantIsolationMany,
  enforceMultiTenantIsolationSingle,
} from '../middleware/multi-tenant-isolation';
import { Season, SeasonRow, mapSeasonRow } from '../models/season';

/**
 * Season Repository
 * Provides data access methods for seasons with tenant isolation
 */
export class SeasonRepository {
  /**
   * Find all seasons for a league with tenant validation
   * 
   * Joins with leagues table to enforce tenant isolation since
   * seasons table doesn't have direct tenant_id column.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns Array of seasons belonging to the league
   */
  async findByLeagueId(tenantId: string, leagueId: string): Promise<Season[]> {
    const query = `
      SELECT 
        s.id,
        s.league_id,
        s.name,
        s.start_date,
        s.end_date,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM seasons s
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE l.tenant_id = $1 AND s.league_id = $2
      ORDER BY s.start_date DESC
    `;

    const rows = await enforceMultiTenantIsolationMany<SeasonRow>(
      tenantId,
      query,
      [leagueId] // Additional param after tenant_id
    );

    return rows.map(mapSeasonRow);
  }

  /**
   * Find active seasons for a league with tenant validation
   * 
   * Returns only seasons where is_active = true.
   * Joins with leagues table to enforce tenant isolation.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns Array of active seasons belonging to the league
   */
  async findActiveByLeagueId(tenantId: string, leagueId: string): Promise<Season[]> {
    const query = `
      SELECT 
        s.id,
        s.league_id,
        s.name,
        s.start_date,
        s.end_date,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM seasons s
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE l.tenant_id = $1 AND s.league_id = $2 AND s.is_active = true
      ORDER BY s.start_date DESC
    `;

    const rows = await enforceMultiTenantIsolationMany<SeasonRow>(
      tenantId,
      query,
      [leagueId] // Additional param after tenant_id
    );

    return rows.map(mapSeasonRow);
  }

  /**
   * Find a season by ID with tenant validation
   * 
   * Joins with leagues table to enforce tenant isolation since
   * seasons table doesn't have direct tenant_id column.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @returns Season if found and belongs to tenant, null otherwise
   */
  async findById(tenantId: string, seasonId: string): Promise<Season | null> {
    const query = `
      SELECT 
        s.id,
        s.league_id,
        s.name,
        s.start_date,
        s.end_date,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM seasons s
      INNER JOIN leagues l ON s.league_id = l.id
      WHERE l.tenant_id = $1 AND s.id = $2
    `;

    const row = await enforceMultiTenantIsolationSingle<SeasonRow>(
      tenantId,
      query,
      [seasonId] // Additional param after tenant_id
    );

    return row ? mapSeasonRow(row) : null;
  }
}
