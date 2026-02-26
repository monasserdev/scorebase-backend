/**
 * League Repository
 * 
 * Data access layer for leagues with multi-tenant isolation.
 * All queries enforce tenant_id filtering and use parameterized queries
 * to prevent SQL injection.
 * 
 * Requirements: 3.1, 3.2, 10.3
 */

import {
  enforceMultiTenantIsolationMany,
  enforceMultiTenantIsolationSingle,
} from '../middleware/multi-tenant-isolation';
import { League, LeagueRow, mapLeagueRow } from '../models/league';

/**
 * League Repository
 * Provides data access methods for leagues with tenant isolation
 */
export class LeagueRepository {
  /**
   * Find all leagues for a tenant
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @returns Array of leagues belonging to the tenant
   */
  async findByTenantId(tenantId: string): Promise<League[]> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        sport_type,
        logo_url,
        primary_color,
        secondary_color,
        created_at,
        updated_at
      FROM leagues
      WHERE tenant_id = $1
      ORDER BY name ASC
    `;

    const rows = await enforceMultiTenantIsolationMany<LeagueRow>(
      tenantId,
      query,
      [] // No additional params - tenant_id is prepended by middleware
    );

    return rows.map(mapLeagueRow);
  }

  /**
   * Find a league by ID with tenant validation
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns League if found and belongs to tenant, null otherwise
   */
  async findById(tenantId: string, leagueId: string): Promise<League | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        sport_type,
        logo_url,
        primary_color,
        secondary_color,
        created_at,
        updated_at
      FROM leagues
      WHERE tenant_id = $1 AND id = $2
    `;

    const row = await enforceMultiTenantIsolationSingle<LeagueRow>(
      tenantId,
      query,
      [leagueId] // Additional param after tenant_id
    );

    return row ? mapLeagueRow(row) : null;
  }
}
