/**
 * Standings Calculation Tests
 * 
 * Unit tests for standings calculation algorithms.
 * Tests verify correct calculation of wins, losses, ties, points,
 * goals, goal differential, and streaks.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculateStreak,
  recalculateStandings,
} from '../../src/utils/standings-calculation';
import { GameRepository } from '../../src/repositories/game-repository';
import { StandingsRepository } from '../../src/repositories/standings-repository';
import { SeasonRepository } from '../../src/repositories/season-repository';
import { TeamRepository } from '../../src/repositories/team-repository';
import { Game, GameStatus } from '../../src/models/game';
import { Season } from '../../src/models/season';
import { Team } from '../../src/models/team';
import { StandingUpsertData } from '../../src/models/standing';

describe('calculateStreak', () => {
  it('should return undefined for empty results', () => {
    expect(calculateStreak([])).toBeUndefined();
  });

  it('should calculate W3 for three consecutive wins', () => {
    expect(calculateStreak(['W', 'W', 'W'])).toBe('W3');
  });

  it('should calculate L2 for two consecutive losses', () => {
    expect(calculateStreak(['L', 'L', 'W', 'W'])).toBe('L2');
  });

  it('should calculate T1 for single tie', () => {
    expect(calculateStreak(['T', 'W', 'W'])).toBe('T1');
  });

  it('should calculate W1 for single win followed by loss', () => {
    expect(calculateStreak(['W', 'L', 'L'])).toBe('W1');
  });

  it('should calculate L5 for five consecutive losses', () => {
    expect(calculateStreak(['L', 'L', 'L', 'L', 'L', 'W'])).toBe('L5');
  });

  it('should calculate T2 for two consecutive ties', () => {
    expect(calculateStreak(['T', 'T', 'W'])).toBe('T2');
  });
});

describe('recalculateStandings', () => {
  let gameRepository: jest.Mocked<GameRepository>;
  let standingsRepository: jest.Mocked<StandingsRepository>;
  let seasonRepository: jest.Mocked<SeasonRepository>;
  let teamRepository: jest.Mocked<TeamRepository>;

  const tenantId = 'tenant-123';
  const seasonId = 'season-456';
  const leagueId = 'league-789';

  beforeEach(() => {
    // Create mock repositories
    gameRepository = {
      findBySeasonId: jest.fn(),
      findById: jest.fn(),
    } as any;

    standingsRepository = {
      findBySeasonId: jest.fn(),
      upsertStandings: jest.fn(),
    } as any;

    seasonRepository = {
      findByLeagueId: jest.fn(),
      findActiveByLeagueId: jest.fn(),
      findById: jest.fn(),
    } as any;

    teamRepository = {
      findByLeagueId: jest.fn(),
      findById: jest.fn(),
    } as any;
  });

  it('should throw error if season not found', async () => {
    seasonRepository.findById.mockResolvedValue(null);

    await expect(
      recalculateStandings(
        tenantId,
        seasonId,
        gameRepository,
        standingsRepository,
        seasonRepository,
        teamRepository
      )
    ).rejects.toThrow(`Season not found: ${seasonId}`);
  });

  it('should initialize standings for all teams with zero values', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue([]);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    expect(standingsRepository.upsertStandings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          team_id: 'team-1',
          games_played: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          goals_for: 0,
          goals_against: 0,
          goal_differential: 0,
          streak: undefined,
        }),
        expect.objectContaining({
          team_id: 'team-2',
          games_played: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          goals_for: 0,
          goals_against: 0,
          goal_differential: 0,
          streak: undefined,
        }),
      ])
    );
  });

  it('should calculate wins correctly (3 points per win)', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    const team1Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-1');
    const team2Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-2');

    // Team 1 wins
    expect(team1Standing).toMatchObject({
      wins: 1,
      losses: 0,
      ties: 0,
      points: 3,
      games_played: 1,
    });

    // Team 2 loses
    expect(team2Standing).toMatchObject({
      wins: 0,
      losses: 1,
      ties: 0,
      points: 0,
      games_played: 1,
    });
  });

  it('should calculate ties correctly (1 point per tie)', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 2,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    const team1Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-1');
    const team2Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-2');

    // Both teams tie
    expect(team1Standing).toMatchObject({
      wins: 0,
      losses: 0,
      ties: 1,
      points: 1,
      games_played: 1,
    });

    expect(team2Standing).toMatchObject({
      wins: 0,
      losses: 0,
      ties: 1,
      points: 1,
      games_played: 1,
    });
  });

  it('should verify games_played equals wins + losses + ties', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-2',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-20'),
        status: GameStatus.FINAL,
        home_score: 2,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-3',
        season_id: seasonId,
        home_team_id: 'team-2',
        away_team_id: 'team-1',
        scheduled_at: new Date('2024-01-25'),
        status: GameStatus.FINAL,
        home_score: 4,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    
    for (const standing of upsertedStandings) {
      expect(standing.games_played).toBe(
        standing.wins + standing.losses + standing.ties
      );
    }
  });

  it('should verify points equals (wins × 3) + (ties × 1)', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-2',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-20'),
        status: GameStatus.FINAL,
        home_score: 2,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    
    for (const standing of upsertedStandings) {
      expect(standing.points).toBe(standing.wins * 3 + standing.ties * 1);
    }
  });

  it('should calculate goal differential correctly (goals_for - goals_against)', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 5,
        away_score: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-2',
        season_id: seasonId,
        home_team_id: 'team-2',
        away_team_id: 'team-1',
        scheduled_at: new Date('2024-01-20'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    
    for (const standing of upsertedStandings) {
      expect(standing.goal_differential).toBe(
        standing.goals_for - standing.goals_against
      );
    }

    const team1Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-1');
    expect(team1Standing?.goals_for).toBe(6); // 5 + 1
    expect(team1Standing?.goals_against).toBe(5); // 2 + 3
    expect(team1Standing?.goal_differential).toBe(1); // 6 - 5
  });

  it('should calculate streaks correctly based on recent results', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    // Team 1 wins 3 games in a row (most recent first in chronological order)
    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-2',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-20'),
        status: GameStatus.FINAL,
        home_score: 2,
        away_score: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'game-3',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-25'),
        status: GameStatus.FINAL,
        home_score: 4,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    const upsertedStandings = standingsRepository.upsertStandings.mock.calls[0][0];
    const team1Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-1');
    const team2Standing = upsertedStandings.find((s: StandingUpsertData) => s.team_id === 'team-2');

    expect(team1Standing?.streak).toBe('W3');
    expect(team2Standing?.streak).toBe('L3');
  });

  it('should only process finalized games', async () => {
    const season: Season = {
      id: seasonId,
      league_id: leagueId,
      name: '2024 Season',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const teams: Team[] = [
      {
        id: 'team-1',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team A',
        abbreviation: 'TMA',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'team-2',
        tenant_id: tenantId,
        league_id: leagueId,
        name: 'Team B',
        abbreviation: 'TMB',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const games: Game[] = [
      {
        id: 'game-1',
        season_id: seasonId,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        scheduled_at: new Date('2024-01-15'),
        status: GameStatus.FINAL,
        home_score: 3,
        away_score: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    seasonRepository.findById.mockResolvedValue(season);
    teamRepository.findByLeagueId.mockResolvedValue(teams);
    gameRepository.findBySeasonId.mockResolvedValue(games);

    await recalculateStandings(
      tenantId,
      seasonId,
      gameRepository,
      standingsRepository,
      seasonRepository,
      teamRepository
    );

    // Verify that findBySeasonId was called with FINAL status filter
    expect(gameRepository.findBySeasonId).toHaveBeenCalledWith(
      tenantId,
      seasonId,
      { status: GameStatus.FINAL }
    );
  });
});
