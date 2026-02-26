/**
 * Standings Service
 * 
 * Business logic layer for standings operations.
 * Handles standings retrieval with proper error handling.
 * 
 * Requirements: 7.9, 14.13
 */

import { StandingsRepository } from '../repositories/standings-repository';
import { TeamStanding } from '../models/standing';

/**
 * Standings Service
 * Provides business logic for standings operations
 */
export class StandingsService {
  constructor(private standingsRepository: StandingsRepository) {}

  /**
   * Get standings for a season ordered by points DESC
   * 
   * Returns standings ordered by:
   * 1. points DESC (primary sort)
   * 2. goal_differential DESC (tiebreaker)
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @returns Array of standings ordered by points DESC, goal_differential DESC
   */
  async getStandingsBySeason(
    tenantId: string,
    seasonId: string
  ): Promise<TeamStanding[]> {
    return this.standingsRepository.findBySeasonId(tenantId, seasonId);
  }
}
