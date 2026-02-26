/**
 * Team Service
 * 
 * Business logic layer for team operations.
 * Handles team retrieval with proper error handling.
 * 
 * Requirements: 4.1, 4.2, 14.5, 14.6
 */

import { TeamRepository } from '../repositories/team-repository';
import { Team } from '../models/team';
import { NotFoundError } from '../models/errors';

/**
 * Team Service
 * Provides business logic for team operations
 */
export class TeamService {
  constructor(private teamRepository: TeamRepository) {}

  /**
   * Get all teams for a league
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param leagueId - League identifier
   * @returns Array of teams belonging to the league
   */
  async getTeamsByLeague(tenantId: string, leagueId: string): Promise<Team[]> {
    return this.teamRepository.findByLeagueId(tenantId, leagueId);
  }

  /**
   * Get a team by ID with 404 handling
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param teamId - Team identifier
   * @returns Team if found and belongs to tenant
   * @throws NotFoundError if team doesn't exist or doesn't belong to tenant
   */
  async getTeamById(tenantId: string, teamId: string): Promise<Team> {
    const team = await this.teamRepository.findById(tenantId, teamId);
    
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    
    return team;
  }
}
