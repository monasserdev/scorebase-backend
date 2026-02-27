#!/bin/bash

# Disable public access to RDS after migrations

echo "Disabling public access to RDS..."

# Get the DB instance identifier
DB_INSTANCE="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw"

# Modify RDS to disable public access
aws rds modify-db-instance \
  --db-instance-identifier "$DB_INSTANCE" \
  --no-publicly-accessible \
  --region us-east-1 \
  --apply-immediately

echo "Waiting for RDS modification to complete..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE" \
  --region us-east-1

echo "✓ RDS public access disabled - database is now secure"
