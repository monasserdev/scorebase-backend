#!/bin/bash

# Temporarily enable public access to RDS for migrations
# WARNING: This should only be used for initial setup

echo "Enabling public access to RDS..."

# Get the DB instance identifier
DB_INSTANCE="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw"

# Modify RDS to allow public access
aws rds modify-db-instance \
  --db-instance-identifier "$DB_INSTANCE" \
  --publicly-accessible \
  --region us-east-1 \
  --apply-immediately

echo "Waiting for RDS modification to complete (this may take 5-10 minutes)..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE" \
  --region us-east-1

echo "✓ RDS is now publicly accessible"
echo ""
echo "Now you need to update the security group to allow your IP:"
echo "1. Go to AWS Console → RDS → Your database → Connectivity & security"
echo "2. Click on the VPC security group"
echo "3. Add an inbound rule: PostgreSQL (port 5432) from your IP address"
echo ""
echo "After that, run: ./run-migrations-local.sh"
echo ""
echo "When done, run: ./disable-rds-public-access.sh to secure it again"
