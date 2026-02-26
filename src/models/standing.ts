/**
 * Standing Models
 * 
 * Type definitions for team standings and related entities.
 * Standings represent calculated team rankings within a season.
 * 
 * Requirements: 7.1, 7.9, 7.10
 */

/**
 * Team standing entity from database
 */
export interface TeamStanding {
  id: string;                    // UUID
  season_id: string;             // UUID - Season identifier
  team_id: string;               // UUID - Team identifier
  games_played: number;          // Total games played
  wins: number;                  // Number of wins
  losses: number;                // Number of losses
  ties: number;                  // Number of ties
  points: number;                // Total points (wins × 3 + ties × 1)
  goals_for: number;             // Total goals scored
  goals_against: number;         // Total goals conceded
  goal_differential: number;     // goals_for - goals_against
  streak?: string;               // Current streak (e.g., "W3", "L2")
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last update timestamp
}

/**
 * Standing database row (matches PostgreSQL schema)
 */
export interface StandingRow {
  id: string;
  season_id: string;
  team_id: string;
  games_played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_differential: number;
  streak: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to TeamStanding model
 */
export function mapStandingRow(row: StandingRow): TeamStanding {
  return {
    id: row.id,
    season_id: row.season_id,
    team_id: row.team_id,
    games_played: row.games_played,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points: row.points,
    goals_for: row.goals_for,
    goals_against: row.goals_against,
    goal_differential: row.goal_differential,
    streak: row.streak || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Standing data for upsert operations
 */
export interface StandingUpsertData {
  season_id: string;
  team_id: string;
  games_played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_differential: number;
  streak?: string;
}
