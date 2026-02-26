/**
 * Season Models
 * 
 * Type definitions for seasons and related entities.
 * Seasons represent time-bound competition periods within a league.
 * 
 * Requirements: 3.3, 3.4
 */

/**
 * Season entity from database
 */
export interface Season {
  id: string;                    // UUID
  league_id: string;             // UUID - Parent league
  name: string;                  // Season name (e.g., "Fall 2024", "2024-2025")
  start_date: Date;              // Season start date
  end_date: Date;                // Season end date
  is_active: boolean;            // Whether season is currently active
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * Season database row (matches PostgreSQL schema)
 */
export interface SeasonRow {
  id: string;
  league_id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to Season model
 */
export function mapSeasonRow(row: SeasonRow): Season {
  return {
    id: row.id,
    league_id: row.league_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
