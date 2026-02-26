/**
 * Standings Calculation Utilities
 * 
 * Algorithms for calculating team standings based on game results.
 * Implements the standings recalculation logic that runs when games are finalized.
 * 
 * Standings Rules:
 * - Win = 3 points
 * - Tie = 1 point
 * - Loss = 0 points
 * - games_played = wins + losses + ties
 * - goal_differential = goals_for - goals_against
 * - Streak is calculated from recent game results (e.g., "W3", "L2", "T1")
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10
 */

import { GameRepository } from '../repositories/game-repository';
import { StandingsRepository } from '../repositories/standings-repository';
import { SeasonRepository } from '../repositories/season-repository';
import { TeamRepository } from '../repositories/team-repository';
import { GameStatus } from '../models/game';
import { StandingUpsertData } from '../models/standing';
import { emitStandingsCalculationDuration } from './metrics';

/**
 * Standing data accumulator for calculation
 */
interface StandingAccumulator {
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
  recent_results: ('W' | 'L' | 'T')[]; // Track recent results for streak calculation
}

/**
 * Calculate streak string from recent game results
 * 
 * Streak format: Letter + Count (e.g., "W3", "L2", "T1")
 * - W = Win
 * - L = Loss
 * - T = Tie
 * 
 * The streak represents consecutive results of the same type,
 * starting from the most recent game.
 * 
 * Examples:
 * - ['W', 'W', 'W', 'L'] → "W3"
 * - ['L', 'L', 'W', 'W'] → "L2"
 * - ['T', 'W', 'W'] → "T1"
 * - [] → undefined
 * 
 * @param recentResults - Array of recent results, most recent first
 * @returns Streak string or undefined if no results
 */
export function calculateStreak(recentResults: ('W' | 'L' | 'T')[]): string | undefined {
  if (recentResults.length === 0) {
    return undefined;
  }

  const mostRecent = recentResults[0];
  let count = 1;

  // Count consecutive results of the same type
  for (let i = 1; i < recentResults.length; i++) {
    if (recentResults[i] === mostRecent) {
      count++;
    } else {
      break;
    }
  }

  return `${mostRecent}${count}`;
}

/**
 * Recalculate standings for all teams in a season
 * 
 * This function:
 * 1. Fetches the season to get the league_id
 * 2. Fetches all teams in the league
 * 3. Fetches all finalized games for the season
 * 4. Initializes standings map for all teams
 * 5. Processes each game to update wins, losses, ties, points, goals
 * 6. Calculates goal differential (goals_for - goals_against)
 * 7. Calculates streaks based on recent game results
 * 8. Persists standings to database using transaction
 * 
 * This function is called when a GAME_FINALIZED event is created.
 * 
 * @param tenantId - Tenant identifier from JWT claims
 * @param seasonId - Season identifier
 * @param gameRepository - Game repository instance
 * @param standingsRepository - Standings repository instance
 * @param seasonRepository - Season repository instance
 * @param teamRepository - Team repository instance
 * @returns Promise that resolves when standings are recalculated
 */
export async function recalculateStandings(
  tenantId: string,
  seasonId: string,
  gameRepository: GameRepository,
  standingsRepository: StandingsRepository,
  seasonRepository: SeasonRepository,
  teamRepository: TeamRepository
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // 1. Fetch the season to get league_id
    const season = await seasonRepository.findById(tenantId, seasonId);
    if (!season) {
      throw new Error(`Season not found: ${seasonId}`);
    }

    // 2. Fetch all teams in the league
    const teams = await teamRepository.findByLeagueId(tenantId, season.league_id);

    // 3. Fetch all finalized games for the season
    const finalizedGames = await gameRepository.findBySeasonId(
      tenantId,
      seasonId,
      { status: GameStatus.FINAL }
    );

    // 4. Initialize standings map for all teams
    const standingsMap = new Map<string, StandingAccumulator>();
    
    for (const team of teams) {
      standingsMap.set(team.id, {
        season_id: seasonId,
        team_id: team.id,
        games_played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        goals_for: 0,
        goals_against: 0,
        goal_differential: 0,
        recent_results: [],
      });
    }

    // 5. Process each game to update standings
    // Sort games by scheduled_at to ensure chronological processing for streaks
    const sortedGames = [...finalizedGames].sort(
      (a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime()
    );

    for (const game of sortedGames) {
      const homeStanding = standingsMap.get(game.home_team_id);
      const awayStanding = standingsMap.get(game.away_team_id);

      // Skip if teams not found (shouldn't happen with proper data)
      if (!homeStanding || !awayStanding) {
        continue;
      }

      // Determine game result
      if (game.home_score > game.away_score) {
        // Home team wins
        homeStanding.wins++;
        homeStanding.points += 3;
        homeStanding.recent_results.unshift('W');
        
        awayStanding.losses++;
        awayStanding.recent_results.unshift('L');
      } else if (game.home_score < game.away_score) {
        // Away team wins
        awayStanding.wins++;
        awayStanding.points += 3;
        awayStanding.recent_results.unshift('W');
        
        homeStanding.losses++;
        homeStanding.recent_results.unshift('L');
      } else {
        // Tie
        homeStanding.ties++;
        homeStanding.points += 1;
        homeStanding.recent_results.unshift('T');
        
        awayStanding.ties++;
        awayStanding.points += 1;
        awayStanding.recent_results.unshift('T');
      }

      // Update games played
      homeStanding.games_played++;
      awayStanding.games_played++;

      // Update goals
      homeStanding.goals_for += game.home_score;
      homeStanding.goals_against += game.away_score;
      awayStanding.goals_for += game.away_score;
      awayStanding.goals_against += game.home_score;

      // Limit recent results to last 10 games for streak calculation
      if (homeStanding.recent_results.length > 10) {
        homeStanding.recent_results = homeStanding.recent_results.slice(0, 10);
      }
      if (awayStanding.recent_results.length > 10) {
        awayStanding.recent_results = awayStanding.recent_results.slice(0, 10);
      }
    }

    // 6. Calculate goal differential and prepare upsert data
    const standingsData: StandingUpsertData[] = [];
    
    for (const standing of Array.from(standingsMap.values())) {
      standing.goal_differential = standing.goals_for - standing.goals_against;
      
      standingsData.push({
        season_id: standing.season_id,
        team_id: standing.team_id,
        games_played: standing.games_played,
        wins: standing.wins,
        losses: standing.losses,
        ties: standing.ties,
        points: standing.points,
        goals_for: standing.goals_for,
        goals_against: standing.goals_against,
        goal_differential: standing.goal_differential,
        streak: calculateStreak(standing.recent_results),
      });
    }

    // 7. Persist standings to database using transaction
    await standingsRepository.upsertStandings(standingsData);
    
    // Emit metric for standings calculation duration
    const duration = Date.now() - startTime;
    await emitStandingsCalculationDuration(tenantId, seasonId, duration);
  } catch (error) {
    // Emit metric even on error
    const duration = Date.now() - startTime;
    await emitStandingsCalculationDuration(tenantId, seasonId, duration);
    throw error;
  }
}
