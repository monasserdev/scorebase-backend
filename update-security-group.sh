#!/bin/bash

# Automatically update RDS security group to allow your IP

echo "Getting your public IP address..."
YOUR_IP=$(curl -4 -s ifconfig.me)
echo "Your IP: $YOUR_IP"

echo ""
echo "Finding RDS security group..."

# Get the security group ID from the RDS instance
DB_INSTANCE="scorebasebackendstack-scorebasedatabasef0553c3a-kzsqyrmwjgtw"
SECURITY_GROUP_ID=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE" \
  --region us-east-1 \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

echo "Security Group ID: $SECURITY_GROUP_ID"

echo ""
echo "Adding inbound rule to allow PostgreSQL from your IP..."

# Add inbound rule for PostgreSQL (port 5432) from your IP
aws ec2 authorize-security-group-ingress \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp \
  --port 5432 \
  --cidr "$YOUR_IP/32" \
  --region us-east-1

echo ""
echo "✓ Security group updated!"
echo "You can now run: ./run-migrations-local.sh"
