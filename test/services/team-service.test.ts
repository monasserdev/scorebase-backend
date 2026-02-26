/**
 * Team Service Tests
 * 
 * Unit tests for TeamService business logic.
 * Tests service methods with mocked repository.
 * 
 * Requirements: 4.1, 4.2, 14.5, 14.6
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TeamService } from '../../src/services/team-service';
import { TeamRepository } from '../../src/repositories/team-repository';
import { Team } from '../../src/models/team';
import { NotFoundError } from '../../src/models/errors';

// Mock TeamRepository
class MockTeamRepository {
  private teams: Team[] = [];

  setMockTeams(teams: Team[]) {
    this.teams = teams;
  }

  async findByLeagueId(tenantId: string, leagueId: string): Promise<Team[]> {
    return this.teams.filter(
      team => team.tenant_id === tenantId && team.league_id === leagueId
    );
  }

  async findById(tenantId: string, teamId: string): Promise<Team | null> {
    const team = this.teams.find(
      t => t.id === teamId && t.tenant_id === tenantId
    );
    return team || null;
  }
}

describe('TeamService', () => {
  let service: TeamService;
  let mockRepository: MockTeamRepository;

  const mockTeam1: Team = {
    id: 'team-1',
    tenant_id: 'tenant-1',
    league_id: 'league-1',
    name: 'Lakers',
    abbreviation: 'LAL',
    logo_url: 'https://example.com/lakers.png',
    primary_color: '#552583',
    secondary_color: '#FDB927',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockTeam2: Team = {
    id: 'team-2',
    tenant_id: 'tenant-1',
    league_id: 'league-1',
    name: 'Warriors',
    abbreviation: 'GSW',
    created_at: new Date('2024-01-02'),
    updated_at: new Date('2024-01-02'),
  };

  const mockTeam3: Team = {
    id: 'team-3',
    tenant_id: 'tenant-1',
    league_id: 'league-2',
    name: 'Celtics',
    abbreviation: 'BOS',
    created_at: new Date('2024-01-03'),
    updated_at: new Date('2024-01-03'),
  };

  const mockTeam4: Team = {
    id: 'team-4',
    tenant_id: 'tenant-2',
    league_id: 'league-3',
    name: 'Heat',
    abbreviation: 'MIA',
    created_at: new Date('2024-01-04'),
    updated_at: new Date('2024-01-04'),
  };

  beforeEach(() => {
    mockRepository = new MockTeamRepository();
    mockRepository.setMockTeams([mockTeam1, mockTeam2, mockTeam3, mockTeam4]);
    service = new TeamService(mockRepository as unknown as TeamRepository);
  });

  describe('getTeamsByLeague', () => {
    it('should return all teams for a league', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-1');
      
      expect(teams).toHaveLength(2);
      expect(teams[0].id).toBe('team-1');
      expect(teams[1].id).toBe('team-2');
    });

    it('should return empty array when league has no teams', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-999');
      
      expect(teams).toHaveLength(0);
    });

    it('should not return teams from other leagues', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-1');
      
      expect(teams.every(t => t.league_id === 'league-1')).toBe(true);
      expect(teams.find(t => t.id === 'team-3')).toBeUndefined();
    });

    it('should not return teams from other tenants', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-1');
      
      expect(teams.every(t => t.tenant_id === 'tenant-1')).toBe(true);
      expect(teams.find(t => t.id === 'team-4')).toBeUndefined();
    });

    it('should return teams with optional fields', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-1');
      const lakers = teams.find(t => t.id === 'team-1');
      
      expect(lakers).toBeDefined();
      expect(lakers!.logo_url).toBe('https://example.com/lakers.png');
      expect(lakers!.primary_color).toBe('#552583');
      expect(lakers!.secondary_color).toBe('#FDB927');
    });

    it('should return teams without optional fields', async () => {
      const teams = await service.getTeamsByLeague('tenant-1', 'league-1');
      const warriors = teams.find(t => t.id === 'team-2');
      
      expect(warriors).toBeDefined();
      expect(warriors!.logo_url).toBeUndefined();
      expect(warriors!.primary_color).toBeUndefined();
      expect(warriors!.secondary_color).toBeUndefined();
    });
  });

  describe('getTeamById', () => {
    it('should return team when it exists and belongs to tenant', async () => {
      const team = await service.getTeamById('tenant-1', 'team-1');
      
      expect(team).toBeDefined();
      expect(team.id).toBe('team-1');
      expect(team.name).toBe('Lakers');
      expect(team.abbreviation).toBe('LAL');
    });

    it('should return team with optional fields', async () => {
      const team = await service.getTeamById('tenant-1', 'team-1');
      
      expect(team).toBeDefined();
      expect(team.logo_url).toBe('https://example.com/lakers.png');
      expect(team.primary_color).toBe('#552583');
      expect(team.secondary_color).toBe('#FDB927');
    });

    it('should return team without optional fields', async () => {
      const team = await service.getTeamById('tenant-1', 'team-2');
      
      expect(team).toBeDefined();
      expect(team.logo_url).toBeUndefined();
      expect(team.primary_color).toBeUndefined();
      expect(team.secondary_color).toBeUndefined();
    });

    it('should throw NotFoundError when team does not exist', async () => {
      await expect(
        service.getTeamById('tenant-1', 'non-existent')
      ).rejects.toThrow(NotFoundError);
      
      await expect(
        service.getTeamById('tenant-1', 'non-existent')
      ).rejects.toThrow('Team not found');
    });

    it('should throw NotFoundError when team belongs to different tenant', async () => {
      // team-4 belongs to tenant-2, not tenant-1
      await expect(
        service.getTeamById('tenant-1', 'team-4')
      ).rejects.toThrow(NotFoundError);
    });

    it('should enforce tenant isolation', async () => {
      // Verify tenant-2 can access their own team
      const team = await service.getTeamById('tenant-2', 'team-4');
      expect(team.id).toBe('team-4');
      
      // But tenant-1 cannot access tenant-2's team
      await expect(
        service.getTeamById('tenant-1', 'team-4')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
