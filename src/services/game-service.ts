/**
 * Game Service
 * 
 * Business logic layer for game operations.
 * Handles game retrieval with proper error handling and filter support.
 * 
 * Requirements: 5.1, 5.2, 14.9, 14.10
 */

import { GameRepository } from '../repositories/game-repository';
import { Game, GameFilters } from '../models/game';
import { NotFoundError } from '../models/errors';

/**
 * Game Service
 * Provides business logic for game operations
 */
export class GameService {
  constructor(private gameRepository: GameRepository) {}

  /**
   * Get all games for a season with optional filters
   * 
   * Supports filtering by status, date range, and team.
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param seasonId - Season identifier
   * @param filters - Optional filters for status, date range, and team
   * @returns Array of games belonging to the season
   */
  async getGamesBySeason(
    tenantId: string,
    seasonId: string,
    filters?: GameFilters
  ): Promise<Game[]> {
    return this.gameRepository.findBySeasonId(tenantId, seasonId, filters);
  }

  /**
   * Get a game by ID with 404 handling
   * 
   * @param tenantId - Tenant identifier from JWT claims
   * @param gameId - Game identifier
   * @returns Game if found and belongs to tenant
   * @throws NotFoundError if game doesn't exist or doesn't belong to tenant
   */
  async getGameById(tenantId: string, gameId: string): Promise<Game> {
    const game = await this.gameRepository.findById(tenantId, gameId);
    
    if (!game) {
      throw new NotFoundError('Game not found');
    }
    
    return game;
  }
}
