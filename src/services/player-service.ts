/**
 * Player Service
 * 
 * Business logic layer for player operations.
 * Handles player retrieval with proper error handling.
 * 
 * Requirements: 4.3, 4.4, 14.7, 14.8
 */

import { PlayerRepository } from '../repositories/player-repository';
import { Player } from '../models/player';
import { NotFoundError } from '../models/errors';

/**
 * Player Service
 * Provides business logic for player operations
 */
export class PlayerService {
  constructor(private playerRepository: PlayerRepository) {}

  /**
   * Get all players for a team
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param teamId - Team identifier
   * @returns Array of players belonging to the team
   */
  async getPlayersByTeam(tenantId: string, teamId: string): Promise<Player[]> {
    return this.playerRepository.findByTeamId(tenantId, teamId);
  }

  /**
   * Get a player by ID with 404 handling
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param playerId - Player identifier
   * @returns Player if found and belongs to tenant
   * @throws NotFoundError if player doesn't exist or doesn't belong to tenant
   */
  async getPlayerById(tenantId: string, playerId: string): Promise<Player> {
    const player = await this.playerRepository.findById(tenantId, playerId);
    
    if (!player) {
      throw new NotFoundError('Player not found');
    }
    
    return player;
  }
}
