/**
 * Team Models
 * 
 * Type definitions for teams and related entities.
 * Teams represent competing entities within a league.
 * 
 * Requirements: 4.1, 4.2
 */

/**
 * Team entity from database
 */
export interface Team {
  id: string;                    // UUID
  tenant_id: string;             // UUID - Multi-tenant isolation
  league_id: string;             // UUID - Parent league
  name: string;                  // Team name
  abbreviation?: string;         // Optional team abbreviation (e.g., "LAL")
  logo_url?: string;             // Optional logo URL
  primary_color?: string;        // Optional hex color (e.g., "#0B2545")
  secondary_color?: string;      // Optional hex color (e.g., "#FCCA46")
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * Team database row (matches PostgreSQL schema)
 */
export interface TeamRow {
  id: string;
  tenant_id: string;
  league_id: string;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to Team model
 */
export function mapTeamRow(row: TeamRow): Team {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    league_id: row.league_id,
    name: row.name,
    abbreviation: row.abbreviation || undefined,
    logo_url: row.logo_url || undefined,
    primary_color: row.primary_color || undefined,
    secondary_color: row.secondary_color || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
