/**
 * League Service Tests
 * 
 * Unit tests for LeagueService business logic.
 * Tests service methods with mocked repository.
 * 
 * Requirements: 3.1, 3.2, 14.1, 14.2
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LeagueService } from '../../src/services/league-service';
import { LeagueRepository } from '../../src/repositories/league-repository';
import { League, SportType } from '../../src/models/league';
import { NotFoundError } from '../../src/models/errors';

// Mock LeagueRepository
class MockLeagueRepository {
  private leagues: League[] = [];

  setMockLeagues(leagues: League[]) {
    this.leagues = leagues;
  }

  async findByTenantId(tenantId: string): Promise<League[]> {
    return this.leagues.filter(league => league.tenant_id === tenantId);
  }

  async findById(tenantId: string, leagueId: string): Promise<League | null> {
    const league = this.leagues.find(
      l => l.id === leagueId && l.tenant_id === tenantId
    );
    return league || null;
  }
}

describe('LeagueService', () => {
  let service: LeagueService;
  let mockRepository: MockLeagueRepository;

  const mockLeague1: League = {
    id: 'league-1',
    tenant_id: 'tenant-1',
    name: 'Basketball League',
    sport_type: SportType.BASKETBALL,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockLeague2: League = {
    id: 'league-2',
    tenant_id: 'tenant-1',
    name: 'Soccer League',
    sport_type: SportType.SOCCER,
    logo_url: 'https://example.com/logo.png',
    primary_color: '#0B2545',
    secondary_color: '#FCCA46',
    created_at: new Date('2024-01-02'),
    updated_at: new Date('2024-01-02'),
  };

  const mockLeague3: League = {
    id: 'league-3',
    tenant_id: 'tenant-2',
    name: 'Hockey League',
    sport_type: SportType.HOCKEY,
    created_at: new Date('2024-01-03'),
    updated_at: new Date('2024-01-03'),
  };

  beforeEach(() => {
    mockRepository = new MockLeagueRepository();
    mockRepository.setMockLeagues([mockLeague1, mockLeague2, mockLeague3]);
    service = new LeagueService(mockRepository as unknown as LeagueRepository);
  });

  describe('getLeagues', () => {
    it('should return all leagues for a tenant', async () => {
      const leagues = await service.getLeagues('tenant-1');
      
      expect(leagues).toHaveLength(2);
      expect(leagues[0].id).toBe('league-1');
      expect(leagues[1].id).toBe('league-2');
    });

    it('should return empty array when tenant has no leagues', async () => {
      const leagues = await service.getLeagues('tenant-3');
      
      expect(leagues).toHaveLength(0);
    });

    it('should not return leagues from other tenants', async () => {
      const leagues = await service.getLeagues('tenant-1');
      
      expect(leagues.every(l => l.tenant_id === 'tenant-1')).toBe(true);
      expect(leagues.find(l => l.id === 'league-3')).toBeUndefined();
    });
  });

  describe('getLeagueById', () => {
    it('should return league when it exists and belongs to tenant', async () => {
      const league = await service.getLeagueById('tenant-1', 'league-1');
      
      expect(league).toBeDefined();
      expect(league.id).toBe('league-1');
      expect(league.name).toBe('Basketball League');
      expect(league.sport_type).toBe(SportType.BASKETBALL);
    });

    it('should return league with optional fields', async () => {
      const league = await service.getLeagueById('tenant-1', 'league-2');
      
      expect(league).toBeDefined();
      expect(league.logo_url).toBe('https://example.com/logo.png');
      expect(league.primary_color).toBe('#0B2545');
      expect(league.secondary_color).toBe('#FCCA46');
    });

    it('should throw NotFoundError when league does not exist', async () => {
      await expect(
        service.getLeagueById('tenant-1', 'non-existent')
      ).rejects.toThrow(NotFoundError);
      
      await expect(
        service.getLeagueById('tenant-1', 'non-existent')
      ).rejects.toThrow('League not found');
    });

    it('should throw NotFoundError when league belongs to different tenant', async () => {
      // league-3 belongs to tenant-2, not tenant-1
      await expect(
        service.getLeagueById('tenant-1', 'league-3')
      ).rejects.toThrow(NotFoundError);
    });

    it('should enforce tenant isolation', async () => {
      // Verify tenant-2 can access their own league
      const league = await service.getLeagueById('tenant-2', 'league-3');
      expect(league.id).toBe('league-3');
      
      // But tenant-1 cannot access tenant-2's league
      await expect(
        service.getLeagueById('tenant-1', 'league-3')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
