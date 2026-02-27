#!/bin/bash

# Run database migrations locally
# This script connects to RDS and runs the migration SQL

echo "Running database migrations..."

# Set environment variables
export DB_HOST="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw.c6v808oo4513.us-east-1.rds.amazonaws.com"
export DB_PORT="5432"
export DB_NAME="scorebase"
export DB_USER="scorebase_admin"
export DB_PASSWORD="HFhVwa0ZeRcKk8Vno1TXzWmxi7Sdajy7"
export DB_SECRET_ARN="arn:aws:secretsmanager:us-east-1:860515818576:secret:scorebase/db/credentials-RgtJ52"

# Run migrations using ts-node
npx ts-node src/scripts/run-migrations.ts

echo "Migrations complete!"
