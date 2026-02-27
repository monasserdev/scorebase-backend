#!/bin/bash

# Run database migrations with direct connection (no Secrets Manager)

echo "Running database migrations with direct connection..."

# Database connection details
DB_HOST="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw.c6v808oo4513.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="scorebase"
DB_USER="scorebase_admin"
DB_PASSWORD="HFhVwa0ZeRcKk8Vno1TXzWmxi7Sdajy7"

# Create a temporary Node.js script in the project directory
cat > ./run-migrations-direct.js << 'EOF'
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000, // 30 seconds
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigrations() {
  try {
    console.log('Testing connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Connected successfully:', result.rows[0]);
    
    console.log('\nCreating tables...');
    
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
    
    console.log('\nCreating indexes...');
    
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
    
    console.log('\n✅ Database migrations completed successfully!');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
EOF

# Export environment variables and run the script
export DB_HOST="$DB_HOST"
export DB_PORT="$DB_PORT"
export DB_NAME="$DB_NAME"
export DB_USER="$DB_USER"
export DB_PASSWORD="$DB_PASSWORD"

node ./run-migrations-direct.js
