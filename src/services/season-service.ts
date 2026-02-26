/**
 * Season Service
 * 
 * Business logic layer for season operations.
 * Handles season retrieval with proper error handling.
 * 
 * Requirements: 3.3, 3.4, 14.3, 14.4
 */

import { SeasonRepository } from '../repositories/season-repository';
import { Season } from '../models/season';
import { NotFoundError } from '../models/errors';

/**
 * Season Service
 * Provides business logic for season operations
 */
export class SeasonService {
  constructor(private seasonRepository: SeasonRepository) {}

  /**
   * Get all seasons for a league
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns Array of seasons belonging to the league
   */
  async getSeasonsByLeague(tenantId: string, leagueId: string): Promise<Season[]> {
    return this.seasonRepository.findByLeagueId(tenantId, leagueId);
  }

  /**
   * Get a season by ID with 404 handling
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @returns Season if found and belongs to tenant
   * @throws NotFoundError if season doesn't exist or doesn't belong to tenant
   */
  async getSeasonById(tenantId: string, seasonId: string): Promise<Season> {
    const season = await this.seasonRepository.findById(tenantId, seasonId);
    
    if (!season) {
      throw new NotFoundError('Season not found');
    }
    
    return season;
  }
}
