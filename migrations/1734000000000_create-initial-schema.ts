/**
 * Initial Schema Migration (V001)
 * 
 * Creates the complete operational database schema for the multi-tenant
 * sports league management system.
 * 
 * Tables created:
 * - tenants: Multi-tenant isolation with subscription tiers
 * - leagues: Sport leagues with branding
 * - seasons: Time-bound competition periods
 * - teams: Teams within leagues
 * - players: Players on teams
 * - games: Scheduled matches between teams
 * - standings: Calculated team rankings
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 7.1
 */

import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable UUID extension
  pgm.createExtension('uuid-ossp', { ifNotExists: true });

  // Create tenants table
  pgm.createTable('tenants', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    subscription_tier: {
      type: 'varchar(50)',
      notNull: true,
      check: "subscription_tier IN ('free', 'standard', 'pro')",
    },
    max_leagues: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create leagues table
  pgm.createTable('leagues', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    sport_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "sport_type IN ('basketball', 'soccer', 'hockey', 'baseball', 'football')",
    },
    logo_url: {
      type: 'text',
    },
    primary_color: {
      type: 'varchar(7)',
    },
    secondary_color: {
      type: 'varchar(7)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraint for leagues -> tenants
  pgm.addConstraint('leagues', 'fk_leagues_tenant', {
    foreignKeys: {
      columns: 'tenant_id',
      references: 'tenants(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create index on tenant_id for leagues
  pgm.createIndex('leagues', 'tenant_id');

  // Create seasons table
  pgm.createTable('seasons', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    league_id: {
      type: 'uuid',
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    start_date: {
      type: 'date',
      notNull: true,
    },
    end_date: {
      type: 'date',
      notNull: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraint for seasons -> leagues
  pgm.addConstraint('seasons', 'fk_seasons_league', {
    foreignKeys: {
      columns: 'league_id',
      references: 'leagues(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create index on league_id for seasons
  pgm.createIndex('seasons', 'league_id');

  // Create index on is_active for seasons
  pgm.createIndex('seasons', 'is_active');

  // Create teams table
  pgm.createTable('teams', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    league_id: {
      type: 'uuid',
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    logo_url: {
      type: 'text',
    },
    primary_color: {
      type: 'varchar(7)',
    },
    secondary_color: {
      type: 'varchar(7)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraint for teams -> leagues
  pgm.addConstraint('teams', 'fk_teams_league', {
    foreignKeys: {
      columns: 'league_id',
      references: 'leagues(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create index on league_id for teams
  pgm.createIndex('teams', 'league_id');

  // Create players table
  pgm.createTable('players', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    team_id: {
      type: 'uuid',
      notNull: true,
    },
    first_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    last_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    jersey_number: {
      type: 'varchar(10)',
    },
    position: {
      type: 'varchar(50)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraint for players -> teams
  pgm.addConstraint('players', 'fk_players_team', {
    foreignKeys: {
      columns: 'team_id',
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create index on team_id for players
  pgm.createIndex('players', 'team_id');

  // Create games table
  pgm.createTable('games', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    season_id: {
      type: 'uuid',
      notNull: true,
    },
    home_team_id: {
      type: 'uuid',
      notNull: true,
    },
    away_team_id: {
      type: 'uuid',
      notNull: true,
    },
    scheduled_at: {
      type: 'timestamp',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'scheduled',
      check: "status IN ('scheduled', 'live', 'final', 'postponed', 'cancelled')",
    },
    home_score: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    away_score: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    location: {
      type: 'varchar(255)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraints for games
  pgm.addConstraint('games', 'fk_games_season', {
    foreignKeys: {
      columns: 'season_id',
      references: 'seasons(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('games', 'fk_games_home_team', {
    foreignKeys: {
      columns: 'home_team_id',
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('games', 'fk_games_away_team', {
    foreignKeys: {
      columns: 'away_team_id',
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create indexes on games
  pgm.createIndex('games', 'season_id');
  pgm.createIndex('games', 'home_team_id');
  pgm.createIndex('games', 'away_team_id');
  pgm.createIndex('games', 'status');
  pgm.createIndex('games', 'scheduled_at');

  // Create standings table
  pgm.createTable('standings', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    season_id: {
      type: 'uuid',
      notNull: true,
    },
    team_id: {
      type: 'uuid',
      notNull: true,
    },
    games_played: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    wins: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    losses: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    ties: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    points: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    goals_for: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    goals_against: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    goal_differential: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    streak: {
      type: 'varchar(10)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add foreign key constraints for standings
  pgm.addConstraint('standings', 'fk_standings_season', {
    foreignKeys: {
      columns: 'season_id',
      references: 'seasons(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('standings', 'fk_standings_team', {
    foreignKeys: {
      columns: 'team_id',
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create unique constraint on season_id + team_id
  pgm.addConstraint('standings', 'uq_standings_season_team', {
    unique: ['season_id', 'team_id'],
  });

  // Create indexes on standings
  pgm.createIndex('standings', 'season_id');
  pgm.createIndex('standings', 'team_id');
  pgm.createIndex('standings', ['season_id', 'points'], {
    name: 'idx_standings_season_points',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop tables in reverse order to respect foreign key constraints
  pgm.dropTable('standings', { cascade: true });
  pgm.dropTable('games', { cascade: true });
  pgm.dropTable('players', { cascade: true });
  pgm.dropTable('teams', { cascade: true });
  pgm.dropTable('seasons', { cascade: true });
  pgm.dropTable('leagues', { cascade: true });
  pgm.dropTable('tenants', { cascade: true });

  // Drop UUID extension
  pgm.dropExtension('uuid-ossp', { ifExists: true });
}
