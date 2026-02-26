/**
 * League Models
 * 
 * Type definitions for leagues and related entities.
 * Leagues represent sport competitions within a tenant.
 * 
 * Requirements: 3.1, 3.2
 */

/**
 * Supported sport types
 */
export enum SportType {
  BASKETBALL = 'basketball',
  SOCCER = 'soccer',
  HOCKEY = 'hockey',
  BASEBALL = 'baseball',
  FOOTBALL = 'football',
}

/**
 * League entity from database
 */
export interface League {
  id: string;                    // UUID
  tenant_id: string;             // UUID - Multi-tenant isolation
  name: string;                  // League name
  sport_type: SportType;         // Type of sport
  logo_url?: string;             // Optional logo URL
  primary_color?: string;        // Optional hex color (e.g., "#0B2545")
  secondary_color?: string;      // Optional hex color (e.g., "#FCCA46")
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * League database row (matches PostgreSQL schema)
 */
export interface LeagueRow {
  id: string;
  tenant_id: string;
  name: string;
  sport_type: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to League model
 */
export function mapLeagueRow(row: LeagueRow): League {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    sport_type: row.sport_type as SportType,
    logo_url: row.logo_url || undefined,
    primary_color: row.primary_color || undefined,
    secondary_color: row.secondary_color || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
