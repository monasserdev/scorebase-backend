#!/bin/bash

# Database Migration Script for ScoreBase Backend API
# Usage: ./scripts/migrate.sh [environment] [command]
# Example: ./scripts/migrate.sh dev up
# Example: ./scripts/migrate.sh staging status

set -e

ENVIRONMENT=${1:-dev}
COMMAND=${2:-up}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}ScoreBase Database Migration${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Command: ${YELLOW}${COMMAND}${NC}"
echo ""

# Check if database.json exists
if [ ! -f "database.json" ]; then
    echo -e "${RED}Error: database.json not found${NC}"
    exit 1
fi

# Check if environment variables are set
if [ -z "$DB_HOST" ] && [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}Warning: No database connection configured${NC}"
    echo "Please set either DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    echo ""
    echo "Example:"
    echo "  export DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    echo "  or"
    echo "  export DB_HOST=localhost"
    echo "  export DB_PORT=5432"
    echo "  export DB_NAME=scorebase"
    echo "  export DB_USER=postgres"
    echo "  export DB_PASSWORD=yourpassword"
    exit 1
fi

# Set NODE_ENV
export NODE_ENV=$ENVIRONMENT

# Run migration command
case $COMMAND in
    up)
        echo -e "${GREEN}Running pending migrations...${NC}"
        node-pg-migrate up
        ;;
    down)
        echo -e "${YELLOW}Rolling back last migration...${NC}"
        node-pg-migrate down
        ;;
    status)
        echo -e "${GREEN}Checking migration status...${NC}"
        node-pg-migrate status
        ;;
    redo)
        echo -e "${YELLOW}Redoing last migration...${NC}"
        node-pg-migrate redo
        ;;
    create)
        if [ -z "$3" ]; then
            echo -e "${RED}Error: Migration name required${NC}"
            echo "Usage: ./scripts/migrate.sh $ENVIRONMENT create <migration-name>"
            exit 1
        fi
        echo -e "${GREEN}Creating new migration: $3${NC}"
        node-pg-migrate create "$3" --migration-file-language ts
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$COMMAND'${NC}"
        echo "Available commands: up, down, status, redo, create"
        exit 1
        ;;
esac

echo -e "${GREEN}Migration command completed successfully${NC}"
