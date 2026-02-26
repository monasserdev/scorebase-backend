/**
 * Player Models
 * 
 * Type definitions for players and related entities.
 * Players represent individual athletes on teams.
 * 
 * Requirements: 4.3, 4.4
 */

/**
 * Player entity from database
 */
export interface Player {
  id: string;                    // UUID
  team_id: string;               // UUID - Parent team
  first_name: string;            // Player first name
  last_name: string;             // Player last name
  jersey_number?: string;        // Optional jersey number (e.g., "23")
  position?: string;             // Optional position (e.g., "Forward", "Goalkeeper")
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * Player database row (matches PostgreSQL schema)
 */
export interface PlayerRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  position: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to Player model
 */
export function mapPlayerRow(row: PlayerRow): Player {
  return {
    id: row.id,
    team_id: row.team_id,
    first_name: row.first_name,
    last_name: row.last_name,
    jersey_number: row.jersey_number || undefined,
    position: row.position || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
