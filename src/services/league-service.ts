/**
 * League Service
 * 
 * Business logic layer for league operations.
 * Handles league retrieval with proper error handling.
 * 
 * Requirements: 3.1, 3.2, 14.1, 14.2
 */

import { LeagueRepository } from '../repositories/league-repository';
import { League } from '../models/league';
import { NotFoundError } from '../models/errors';

/**
 * League Service
 * Provides business logic for league operations
 */
export class LeagueService {
  constructor(private leagueRepository: LeagueRepository) {}

  /**
   * Get all leagues for a tenant
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @returns Array of leagues belonging to the tenant
   */
  async getLeagues(tenantId: string): Promise<League[]> {
    return this.leagueRepository.findByTenantId(tenantId);
  }

  /**
   * Get a league by ID with 404 handling
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns League if found and belongs to tenant
   * @throws NotFoundError if league doesn't exist or doesn't belong to tenant
   */
  async getLeagueById(tenantId: string, leagueId: string): Promise<League> {
    const league = await this.leagueRepository.findById(tenantId, leagueId);
    
    if (!league) {
      throw new NotFoundError('League not found');
    }
    
    return league;
  }
}
