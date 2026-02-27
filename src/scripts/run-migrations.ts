/**
 * Database Migration Runner
 * 
 * This script runs database migrations using node-pg-migrate.
 * Can be invoked as a Lambda function or run locally.
 */

import { getPool } from '../config/database';

interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<MigrationResult> {
  try {
    console.log('Starting database migrations...');
    
    // Get database pool to ensure connection works
    const pool = await getPool();
    
    // Test connection
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0]);
    
    // Run the initial schema migration manually
    // This is the content from migrations/1734000000000_create-initial-schema.ts
    
    console.log('Creating tables...');
    
    // Create leagues table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        sport_type VARCHAR(50) NOT NULL,
        logo_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT leagues_tenant_name_unique UNIQUE (tenant_id, name)
      )
    `);
    console.log('✓ Created leagues table');
    
    // Create seasons table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'upcoming',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT seasons_league_name_unique UNIQUE (league_id, name),
        CONSTRAINT seasons_dates_check CHECK (end_date >= start_date)
      )
    `);
    console.log('✓ Created seasons table');
    
    // Create teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        logo_url TEXT,
        home_venue VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT teams_league_name_unique UNIQUE (league_id, name)
      )
    `);
    console.log('✓ Created teams table');
    
    // Create players table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        jersey_number VARCHAR(10),
        position VARCHAR(50),
        date_of_birth DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created players table');
    
    // Create games table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        home_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
        away_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
        scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
        venue VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        home_score INTEGER DEFAULT 0,
        away_score INTEGER DEFAULT 0,
        current_period INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT games_teams_different CHECK (home_team_id != away_team_id)
      )
    `);
    console.log('✓ Created games table');
    
    // Create standings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS standings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        ties INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        goals_for INTEGER DEFAULT 0,
        goals_against INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT standings_season_team_unique UNIQUE (season_id, team_id)
      )
    `);
    console.log('✓ Created standings table');
    
    // Create indexes
    console.log('Creating indexes...');
    
    await pool.query('CREATE INDEX IF NOT EXISTS idx_leagues_tenant_id ON leagues(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_seasons_tenant_id ON seasons(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_seasons_league_id ON seasons(league_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_players_tenant_id ON players(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_games_tenant_id ON games(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_games_season_id ON games(season_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_games_scheduled_at ON games(scheduled_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_standings_tenant_id ON standings(tenant_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_standings_season_id ON standings(season_id)');
    
    console.log('✓ Created all indexes');
    
    console.log('✅ Database migrations completed successfully!');
    
    return {
      success: true,
      message: 'Database migrations completed successfully',
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      message: 'Migration failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Lambda handler for running migrations
 */
export async function handler(): Promise<any> {
  const result = await runMigrations();
  
  return {
    statusCode: result.success ? 200 : 500,
    body: JSON.stringify(result),
  };
}

// Allow running directly with ts-node
if (require.main === module) {
  runMigrations()
    .then((result) => {
      console.log('Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
