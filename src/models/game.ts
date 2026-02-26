/**
 * Game Models
 * 
 * Type definitions for games and related entities.
 * Games represent scheduled matches between teams within a season.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

/**
 * Game status values
 */
export enum GameStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  FINAL = 'final',
  POSTPONED = 'postponed',
  CANCELLED = 'cancelled',
}

/**
 * Game entity from database
 */
export interface Game {
  id: string;                    // UUID
  season_id: string;             // UUID - Season identifier
  home_team_id: string;          // UUID - Home team identifier
  away_team_id: string;          // UUID - Away team identifier
  scheduled_at: Date;            // Scheduled game time
  status: GameStatus;            // Current game status
  home_score: number;            // Home team score
  away_score: number;            // Away team score
  location?: string;             // Optional game location
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * Game database row (matches PostgreSQL schema)
 */
export interface GameRow {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: Date;
  status: string;
  home_score: number;
  away_score: number;
  location: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Filters for querying games
 */
export interface GameFilters {
  status?: GameStatus;           // Filter by game status
  startDate?: Date;              // Filter by scheduled_at >= startDate
  endDate?: Date;                // Filter by scheduled_at <= endDate
  teamId?: string;               // Filter by team (home or away)
}

/**
 * Convert database row to Game model
 */
export function mapGameRow(row: GameRow): Game {
  return {
    id: row.id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    scheduled_at: row.scheduled_at,
    status: row.status as GameStatus,
    home_score: row.home_score,
    away_score: row.away_score,
    location: row.location || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
