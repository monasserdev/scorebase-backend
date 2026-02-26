/**
 * Player Service Tests
 * 
 * Unit tests for PlayerService business logic.
 * Tests service methods with mocked repository.
 * 
 * Requirements: 4.3, 4.4, 14.7, 14.8
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PlayerService } from '../../src/services/player-service';
import { PlayerRepository } from '../../src/repositories/player-repository';
import { Player } from '../../src/models/player';
import { NotFoundError } from '../../src/models/errors';

// Mock PlayerRepository
class MockPlayerRepository {
  private players: Player[] = [];

  setMockPlayers(players: Player[]) {
    this.players = players;
  }

  async findByTeamId(tenantId: string, teamId: string): Promise<Player[]> {
    // Simulate tenant isolation through team->league relationship
    return this.players.filter(player => {
      const playerTenantId = (player as any).tenant_id; // For testing purposes
      return player.team_id === teamId && playerTenantId === tenantId;
    });
  }

  async findById(tenantId: string, playerId: string): Promise<Player | null> {
    const player = this.players.find(p => {
      const playerTenantId = (p as any).tenant_id; // For testing purposes
      return p.id === playerId && playerTenantId === tenantId;
    });
    return player || null;
  }
}

describe('PlayerService', () => {
  let service: PlayerService;
  let mockRepository: MockPlayerRepository;

  const mockPlayer1: Player & { tenant_id: string } = {
    id: 'player-1',
    team_id: 'team-1',
    tenant_id: 'tenant-1',
    first_name: 'John',
    last_name: 'Smith',
    jersey_number: '23',
    position: 'Forward',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockPlayer2: Player & { tenant_id: string } = {
    id: 'player-2',
    team_id: 'team-1',
    tenant_id: 'tenant-1',
    first_name: 'Jane',
    last_name: 'Doe',
    jersey_number: '10',
    position: 'Midfielder',
    created_at: new Date('2024-01-02'),
    updated_at: new Date('2024-01-02'),
  };

  const mockPlayer3: Player & { tenant_id: string } = {
    id: 'player-3',
    team_id: 'team-2',
    tenant_id: 'tenant-1',
    first_name: 'Bob',
    last_name: 'Johnson',
    created_at: new Date('2024-01-03'),
    updated_at: new Date('2024-01-03'),
  };

  const mockPlayer4: Player & { tenant_id: string } = {
    id: 'player-4',
    team_id: 'team-3',
    tenant_id: 'tenant-2',
    first_name: 'Alice',
    last_name: 'Williams',
    jersey_number: '7',
    created_at: new Date('2024-01-04'),
    updated_at: new Date('2024-01-04'),
  };

  beforeEach(() => {
    mockRepository = new MockPlayerRepository();
    mockRepository.setMockPlayers([mockPlayer1, mockPlayer2, mockPlayer3, mockPlayer4]);
    service = new PlayerService(mockRepository as unknown as PlayerRepository);
  });

  describe('getPlayersByTeam', () => {
    it('should return all players for a team', async () => {
      const players = await service.getPlayersByTeam('tenant-1', 'team-1');
      
      expect(players).toHaveLength(2);
      expect(players[0].id).toBe('player-1');
      expect(players[1].id).toBe('player-2');
    });

    it('should return empty array when team has no players', async () => {
      const players = await service.getPlayersByTeam('tenant-1', 'team-999');
      
      expect(players).toHaveLength(0);
    });

    it('should return players with all fields', async () => {
      const players = await service.getPlayersByTeam('tenant-1', 'team-1');
      
      expect(players[0].first_name).toBe('John');
      expect(players[0].last_name).toBe('Smith');
      expect(players[0].jersey_number).toBe('23');
      expect(players[0].position).toBe('Forward');
    });

    it('should return players with optional fields undefined', async () => {
      const players = await service.getPlayersByTeam('tenant-1', 'team-2');
      
      expect(players).toHaveLength(1);
      expect(players[0].id).toBe('player-3');
      expect(players[0].jersey_number).toBeUndefined();
      expect(players[0].position).toBeUndefined();
    });

    it('should not return players from other tenants', async () => {
      const players = await service.getPlayersByTeam('tenant-1', 'team-1');
      
      expect(players.every(p => (p as any).tenant_id === 'tenant-1')).toBe(true);
      expect(players.find(p => p.id === 'player-4')).toBeUndefined();
    });
  });

  describe('getPlayerById', () => {
    it('should return player when it exists and belongs to tenant', async () => {
      const player = await service.getPlayerById('tenant-1', 'player-1');
      
      expect(player).toBeDefined();
      expect(player.id).toBe('player-1');
      expect(player.first_name).toBe('John');
      expect(player.last_name).toBe('Smith');
      expect(player.jersey_number).toBe('23');
      expect(player.position).toBe('Forward');
    });

    it('should return player with optional fields', async () => {
      const player = await service.getPlayerById('tenant-1', 'player-2');
      
      expect(player).toBeDefined();
      expect(player.jersey_number).toBe('10');
      expect(player.position).toBe('Midfielder');
    });

    it('should return player without optional fields', async () => {
      const player = await service.getPlayerById('tenant-1', 'player-3');
      
      expect(player).toBeDefined();
      expect(player.jersey_number).toBeUndefined();
      expect(player.position).toBeUndefined();
    });

    it('should throw NotFoundError when player does not exist', async () => {
      await expect(
        service.getPlayerById('tenant-1', 'non-existent')
      ).rejects.toThrow(NotFoundError);
      
      await expect(
        service.getPlayerById('tenant-1', 'non-existent')
      ).rejects.toThrow('Player not found');
    });

    it('should throw NotFoundError when player belongs to different tenant', async () => {
      // player-4 belongs to tenant-2, not tenant-1
      await expect(
        service.getPlayerById('tenant-1', 'player-4')
      ).rejects.toThrow(NotFoundError);
    });

    it('should enforce tenant isolation', async () => {
      // Verify tenant-2 can access their own player
      const player = await service.getPlayerById('tenant-2', 'player-4');
      expect(player.id).toBe('player-4');
      
      // But tenant-1 cannot access tenant-2's player
      await expect(
        service.getPlayerById('tenant-1', 'player-4')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
