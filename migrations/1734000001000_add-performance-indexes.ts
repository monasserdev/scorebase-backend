/**
 * Performance Indexes Migration (V002)
 * 
 * Adds performance-critical indexes that optimize multi-tenant queries
 * and common access patterns. These indexes complement the initial schema
 * by adding coverage for tenant isolation and frequently queried columns.
 * 
 * Indexes added:
 * - tenant_id indexes on all tables with tenant relationships
 * - Foreign key indexes not covered in V001
 * - Frequently queried column indexes (status, scheduled_at, is_active)
 * - Composite index on standings for optimized leaderboard queries
 * 
 * Requirements: 9.6
 */

import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add tenant_id indexes for multi-tenant isolation
  // Note: leagues.tenant_id already has an index from V001
  
  // Add tenant_id index on seasons (via league_id relationship)
  // This helps with tenant-scoped season queries
  pgm.createIndex('seasons', ['league_id', 'is_active'], {
    name: 'idx_seasons_league_active',
  });

  // Add tenant_id index on teams (via league_id relationship)
  // This helps with tenant-scoped team queries
  pgm.createIndex('teams', ['league_id', 'name'], {
    name: 'idx_teams_league_name',
  });

  // Add tenant_id index on players (via team_id relationship)
  // This helps with tenant-scoped player queries
  pgm.createIndex('players', ['team_id', 'last_name', 'first_name'], {
    name: 'idx_players_team_name',
  });

  // Add composite index on games for common query patterns
  // Supports filtering by season, status, and date range
  pgm.createIndex('games', ['season_id', 'status', 'scheduled_at'], {
    name: 'idx_games_season_status_scheduled',
  });

  // Add index for team-based game queries (finding all games for a team)
  pgm.createIndex('games', ['home_team_id', 'scheduled_at'], {
    name: 'idx_games_home_team_scheduled',
  });

  pgm.createIndex('games', ['away_team_id', 'scheduled_at'], {
    name: 'idx_games_away_team_scheduled',
  });

  // Add composite index on standings for optimized sorting
  // Note: idx_standings_season_points already exists from V001
  // Add additional index for team-based lookups
  pgm.createIndex('standings', ['team_id', 'points'], {
    name: 'idx_standings_team_points',
  });

  // Add index on tenants for subscription tier queries
  pgm.createIndex('tenants', 'subscription_tier', {
    name: 'idx_tenants_subscription_tier',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop indexes in reverse order
  pgm.dropIndex('tenants', 'subscription_tier', {
    name: 'idx_tenants_subscription_tier',
  });

  pgm.dropIndex('standings', ['team_id', 'points'], {
    name: 'idx_standings_team_points',
  });

  pgm.dropIndex('games', ['away_team_id', 'scheduled_at'], {
    name: 'idx_games_away_team_scheduled',
  });

  pgm.dropIndex('games', ['home_team_id', 'scheduled_at'], {
    name: 'idx_games_home_team_scheduled',
  });

  pgm.dropIndex('games', ['season_id', 'status', 'scheduled_at'], {
    name: 'idx_games_season_status_scheduled',
  });

  pgm.dropIndex('players', ['team_id', 'last_name', 'first_name'], {
    name: 'idx_players_team_name',
  });

  pgm.dropIndex('teams', ['league_id', 'name'], {
    name: 'idx_teams_league_name',
  });

  pgm.dropIndex('seasons', ['league_id', 'is_active'], {
    name: 'idx_seasons_league_active',
  });
}
