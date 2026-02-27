#!/bin/bash
set -e

echo "🗄️  ScoreBase Database Initialization"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI is not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} AWS CLI configured"

# Get database credentials from Secrets Manager
echo ""
echo "📦 Fetching database credentials from Secrets Manager..."
SECRET_ARN="arn:aws:secretsmanager:us-east-1:860515818576:secret:scorebase/db/credentials-RgtJ52"

SECRET_JSON=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ARN" \
    --region us-east-1 \
    --query SecretString \
    --output text)

DB_USER=$(echo $SECRET_JSON | jq -r .username)
DB_PASSWORD=$(echo $SECRET_JSON | jq -r .password)

echo -e "${GREEN}✓${NC} Credentials retrieved"

# Database connection details
DB_HOST="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw.c6v808oo4513.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="scorebase"

echo ""
echo "🔌 Database connection details:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL client (psql) is not installed.${NC}"
    echo ""
    echo "The database is in a private VPC and cannot be accessed directly from your machine."
    echo ""
    echo "Please use one of these methods instead:"
    echo ""
    echo "1. ${GREEN}Use AWS Lambda to run migrations (Recommended):${NC}"
    echo "   The migration script is already in your Lambda function."
    echo "   Just invoke it with:"
    echo ""
    echo "   aws lambda invoke \\"
    echo "     --function-name scorebase-api \\"
    echo "     --payload '{\"runMigrations\":true}' \\"
    echo "     --region us-east-1 \\"
    echo "     response.json && cat response.json"
    echo ""
    echo "2. ${GREEN}Use AWS Systems Manager Session Manager:${NC}"
    echo "   Create a bastion host in the VPC and connect via SSM."
    echo ""
    echo "3. ${GREEN}Temporarily enable public access (NOT recommended for production):${NC}"
    echo "   - Go to RDS Console"
    echo "   - Modify the database to enable public access"
    echo "   - Add your IP to security group"
    echo "   - Run this script again"
    echo "   - Disable public access after migrations"
    echo ""
    exit 1
fi

# Try to connect (this will likely fail since DB is in private VPC)
echo "🔄 Attempting to connect to database..."
echo ""

export PGPASSWORD="$DB_PASSWORD"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Connected to database successfully!"
    echo ""
    echo "🚀 Running migrations..."
    echo ""
    
    # Run migrations using the SQL from the migration file
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Create leagues table
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  sport_type VARCHAR(50) NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT leagues_tenant_name_unique UNIQUE (tenant_id, name)
);

-- Create seasons table
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
);

-- Create teams table
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
);

-- Create players table
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
);

-- Create games table
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
);

-- Create standings table
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
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leagues_tenant_id ON leagues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seasons_tenant_id ON seasons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seasons_league_id ON seasons(league_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id);
CREATE INDEX IF NOT EXISTS idx_players_tenant_id ON players(tenant_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_games_tenant_id ON games(tenant_id);
CREATE INDEX IF NOT EXISTS idx_games_season_id ON games(season_id);
CREATE INDEX IF NOT EXISTS idx_games_scheduled_at ON games(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_standings_tenant_id ON standings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_standings_season_id ON standings(season_id);

SELECT 'Migrations completed successfully!' as result;
EOF
    
    echo ""
    echo -e "${GREEN}✅ Database initialized successfully!${NC}"
    echo ""
    echo "You can now test your API:"
    echo ""
    echo "curl -X GET \\"
    echo "  \"https://9bp89zkwlb.execute-api.us-east-1.amazonaws.com/v1/leagues\" \\"
    echo "  -H \"Authorization: Bearer \$TOKEN\""
    echo ""
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo ""
    echo "The database is in a private VPC and cannot be accessed from your machine."
    echo ""
    echo -e "${YELLOW}Please use the Lambda method instead:${NC}"
    echo ""
    echo "1. Build and package the Lambda with migrations:"
    echo "   npm run build"
    echo "   ./scripts/package-lambda.sh"
    echo "   cp -r docs lambda-package/"
    echo ""
    echo "2. Update Lambda:"
    echo "   cd lambda-package && zip -r ../lambda-deployment.zip . && cd .."
    echo "   aws lambda update-function-code \\"
    echo "     --function-name scorebase-api \\"
    echo "     --zip-file fileb://lambda-deployment.zip \\"
    echo "     --region us-east-1"
    echo ""
    echo "3. Invoke migration via Lambda:"
    echo "   aws lambda invoke \\"
    echo "     --function-name scorebase-api \\"
    echo "     --payload '{\"runMigrations\":true}' \\"
    echo "     --region us-east-1 \\"
    echo "     response.json && cat response.json"
    echo ""
fi

unset PGPASSWORD
