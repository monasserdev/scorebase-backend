# ScoreBase Backend API - Smoke Testing Guide

## Overview

This guide provides comprehensive smoke testing procedures to verify the ScoreBase Backend API is functioning correctly after deployment to staging or production environments. Smoke tests validate critical functionality without exhaustive testing.

## Purpose of Smoke Tests

Smoke tests are designed to:
- Verify the deployment was successful
- Confirm critical API endpoints are accessible
- Validate authentication and authorization
- Test core business logic (leagues, games, events, standings)
- Ensure multi-tenant isolation is working
- Verify database connectivity and data persistence
- Check monitoring and logging systems

## Prerequisites

### Required Tools
- `curl` or Postman for API testing
- `jq` for JSON parsing (optional but recommended)
- AWS CLI configured with appropriate credentials
- Valid JWT token from Cognito User Pool

### Environment Setup

```bash
# Set environment variables
export API_BASE_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com"
export JWT_TOKEN="your-jwt-token-here"
export TENANT_ID="your-tenant-id-here"

# Verify environment
echo "API Base URL: $API_BASE_URL"
echo "JWT Token: ${JWT_TOKEN:0:20}..."
echo "Tenant ID: $TENANT_ID"
```

### Obtaining a JWT Token

```bash
# Authenticate with Cognito (example using AWS CLI)
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id your-client-id \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPassword123! \
  --query 'AuthenticationResult.IdToken' \
  --output text
```

## Smoke Test Checklist

### 1. Infrastructure Health Checks

#### 1.1 Lambda Function Status
```bash
# Check Lambda function exists and is active
aws lambda get-function \
  --function-name scorebase-api-staging \
  --query 'Configuration.[FunctionName,State,LastUpdateStatus]' \
  --output table

# Expected: State=Active, LastUpdateStatus=Successful
```

#### 1.2 API Gateway Endpoint
```bash
# Test API Gateway is responding
curl -i $API_BASE_URL/v1/health

# Expected: HTTP 200 or 404 (health endpoint may not be implemented)
```

#### 1.3 Database Connectivity
```bash
# Check RDS instance status
aws rds describe-db-instances \
  --db-instance-identifier scorebase-staging \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]' \
  --output table

# Expected: DBInstanceStatus=available
```

#### 1.4 DynamoDB Table
```bash
# Check DynamoDB table exists
aws dynamodb describe-table \
  --table-name scorebase-events-staging \
  --query 'Table.[TableName,TableStatus,ItemCount]' \
  --output table

# Expected: TableStatus=ACTIVE
```

### 2. Authentication and Authorization Tests

#### 2.1 Missing JWT Token (401 Unauthorized)
```bash
# Request without Authorization header
curl -i -X GET "$API_BASE_URL/v1/leagues"

# Expected Response:
# HTTP 401 Unauthorized
# {
#   "error": {
#     "code": "UNAUTHORIZED",
#     "message": "Authorization header is missing",
#     "request_id": "uuid"
#   }
# }
```

#### 2.2 Invalid JWT Token (401 Unauthorized)
```bash
# Request with invalid token
curl -i -X GET "$API_BASE_URL/v1/leagues" \
  -H "Authorization: Bearer invalid-token"

# Expected Response:
# HTTP 401 Unauthorized
# {
#   "error": {
#     "code": "UNAUTHORIZED",
#     "message": "Invalid token format",
#     "request_id": "uuid"
#   }
# }
```

#### 2.3 Valid JWT Token (Success)
```bash
# Request with valid token
curl -i -X GET "$API_BASE_URL/v1/leagues" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected Response:
# HTTP 200 OK
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [...]
# }
```

### 3. League Management Tests

#### 3.1 Get All Leagues
```bash
# Fetch all leagues for tenant
curl -X GET "$API_BASE_URL/v1/leagues" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "league_id": "uuid",
#       "tenant_id": "uuid",
#       "name": "Youth Basketball League",
#       "sport_type": "basketball",
#       "created_at": "2024-01-01T00:00:00.000Z"
#     }
#   ]
# }

# Validation:
# - Response includes request_id and timestamp
# - All leagues belong to requesting tenant
# - Data structure matches League model
```

#### 3.2 Get League by ID
```bash
# Replace LEAGUE_ID with actual league ID from previous response
export LEAGUE_ID="your-league-id"

curl -X GET "$API_BASE_URL/v1/leagues/$LEAGUE_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": {
#     "league_id": "uuid",
#     "tenant_id": "uuid",
#     "name": "Youth Basketball League",
#     "sport_type": "basketball",
#     "created_at": "2024-01-01T00:00:00.000Z"
#   }
# }
```

#### 3.3 Get Non-Existent League (404 Not Found)
```bash
curl -i -X GET "$API_BASE_URL/v1/leagues/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected Response:
# HTTP 404 Not Found
# {
#   "error": {
#     "code": "NOT_FOUND",
#     "message": "League not found",
#     "request_id": "uuid"
#   }
# }
```

### 4. Season Management Tests

#### 4.1 Get Seasons by League
```bash
curl -X GET "$API_BASE_URL/v1/leagues/$LEAGUE_ID/seasons" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "season_id": "uuid",
#       "league_id": "uuid",
#       "name": "Spring 2024",
#       "start_date": "2024-03-01",
#       "end_date": "2024-06-30",
#       "is_active": true
#     }
#   ]
# }
```

#### 4.2 Get Season by ID
```bash
export SEASON_ID="your-season-id"

curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### 5. Team Management Tests

#### 5.1 Get Teams by League
```bash
curl -X GET "$API_BASE_URL/v1/leagues/$LEAGUE_ID/teams" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "team_id": "uuid",
#       "league_id": "uuid",
#       "name": "Warriors",
#       "logo_url": "https://...",
#       "primary_color": "#FDB927",
#       "secondary_color": "#006BB6"
#     }
#   ]
# }
```

#### 5.2 Get Team by ID
```bash
export TEAM_ID="your-team-id"

curl -X GET "$API_BASE_URL/v1/teams/$TEAM_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### 6. Player Management Tests

#### 6.1 Get Players by Team
```bash
curl -X GET "$API_BASE_URL/v1/teams/$TEAM_ID/players" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "player_id": "uuid",
#       "team_id": "uuid",
#       "first_name": "John",
#       "last_name": "Doe",
#       "jersey_number": "23",
#       "position": "Forward"
#     }
#   ]
# }
```

#### 6.2 Get Player by ID
```bash
export PLAYER_ID="your-player-id"

curl -X GET "$API_BASE_URL/v1/players/$PLAYER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### 7. Game Management Tests

#### 7.1 Get Games by Season
```bash
curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID/games" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "game_id": "uuid",
#       "season_id": "uuid",
#       "home_team_id": "uuid",
#       "away_team_id": "uuid",
#       "scheduled_at": "2024-03-15T18:00:00.000Z",
#       "status": "scheduled",
#       "home_score": 0,
#       "away_score": 0
#     }
#   ]
# }
```

#### 7.2 Get Games with Filters
```bash
# Filter by status
curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID/games?status=live" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

# Filter by date range
curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID/games?start_date=2024-03-01&end_date=2024-03-31" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq

# Filter by team
curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID/games?team_id=$TEAM_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

#### 7.3 Get Game by ID
```bash
export GAME_ID="your-game-id"

curl -X GET "$API_BASE_URL/v1/games/$GAME_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### 8. Event Sourcing Tests

#### 8.1 Get Events by Game
```bash
curl -X GET "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "event_id": "uuid",
#       "game_id": "uuid",
#       "event_type": "GAME_STARTED",
#       "occurred_at": "2024-03-15T18:00:00.000Z",
#       "payload": {}
#     }
#   ]
# }
```

#### 8.2 Create Event (Scorekeeper Role Required)
```bash
# Note: This requires a JWT token with 'scorekeeper' role

# Create GAME_STARTED event
curl -X POST "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GAME_STARTED",
    "payload": {}
  }' | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": {
#     "event_id": "uuid",
#     "game_id": "uuid",
#     "event_type": "GAME_STARTED",
#     "occurred_at": "2024-03-15T18:00:00.000Z"
#   }
# }
```

#### 8.3 Create GOAL_SCORED Event
```bash
curl -X POST "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GOAL_SCORED",
    "payload": {
      "team_id": "'$TEAM_ID'",
      "player_id": "'$PLAYER_ID'",
      "period": 1,
      "time_remaining": "10:30"
    }
  }' | jq

# Validation:
# - Event persisted to DynamoDB
# - Game score updated in RDS
# - Response includes event_id
```

#### 8.4 Create GAME_FINALIZED Event
```bash
curl -X POST "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GAME_FINALIZED",
    "payload": {
      "final_home_score": 95,
      "final_away_score": 88
    }
  }' | jq

# Validation:
# - Game status updated to 'final'
# - Standings recalculated for season
```

#### 8.5 Invalid Event Payload (400 Bad Request)
```bash
curl -i -X POST "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GOAL_SCORED",
    "payload": {}
  }'

# Expected Response:
# HTTP 400 Bad Request
# {
#   "error": {
#     "code": "VALIDATION_ERROR",
#     "message": "Invalid event payload",
#     "request_id": "uuid",
#     "details": {
#       "missing_fields": ["team_id", "player_id"]
#     }
#   }
# }
```

### 9. Standings Tests

#### 9.1 Get Standings by Season
```bash
curl -X GET "$API_BASE_URL/v1/seasons/$SEASON_ID/standings" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" | jq

# Expected Response:
# {
#   "request_id": "uuid",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "data": [
#     {
#       "team_id": "uuid",
#       "team_name": "Warriors",
#       "games_played": 10,
#       "wins": 7,
#       "losses": 3,
#       "ties": 0,
#       "points": 21,
#       "goals_for": 95,
#       "goals_against": 78,
#       "goal_differential": 17,
#       "streak": "W3"
#     }
#   ]
# }

# Validation:
# - Standings ordered by points DESC
# - games_played = wins + losses + ties
# - points = (wins × 3) + (ties × 1)
# - goal_differential = goals_for - goals_against
```

### 10. Multi-Tenant Isolation Tests

#### 10.1 Cross-Tenant Access Attempt
```bash
# Attempt to access another tenant's league
# (Use a league_id from a different tenant)
export OTHER_TENANT_LEAGUE_ID="other-tenant-league-id"

curl -i -X GET "$API_BASE_URL/v1/leagues/$OTHER_TENANT_LEAGUE_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected Response:
# HTTP 404 Not Found (not 403, to avoid information disclosure)
# {
#   "error": {
#     "code": "NOT_FOUND",
#     "message": "League not found",
#     "request_id": "uuid"
#   }
# }

# Validation:
# - Cross-tenant access blocked
# - Security violation logged to CloudWatch
# - Metric emitted for monitoring
```

### 11. Error Handling Tests

#### 11.1 Invalid Request Body (400 Bad Request)
```bash
curl -i -X POST "$API_BASE_URL/v1/games/$GAME_ID/events" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d 'invalid-json'

# Expected Response:
# HTTP 400 Bad Request
```

#### 11.2 Unsupported HTTP Method (405 Method Not Allowed)
```bash
curl -i -X DELETE "$API_BASE_URL/v1/leagues/$LEAGUE_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected Response:
# HTTP 405 Method Not Allowed or 404 Not Found
```

#### 11.3 Rate Limiting (429 Too Many Requests)
```bash
# Send rapid requests to trigger rate limiting
for i in {1..100}; do
  curl -X GET "$API_BASE_URL/v1/leagues" \
    -H "Authorization: Bearer $JWT_TOKEN" &
done
wait

# Expected: Some requests return HTTP 429 (if rate limiting configured)
```

### 12. Monitoring and Logging Tests

#### 12.1 CloudWatch Logs
```bash
# View recent Lambda logs
aws logs tail /aws/lambda/scorebase-api-staging --follow

# Expected: Structured JSON logs with request_id, tenant_id, user_id
```

#### 12.2 CloudWatch Metrics
```bash
# Check custom metrics
aws cloudwatch get-metric-statistics \
  --namespace ScoreBase/API \
  --metric-name StandingsCalculationDuration \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --dimensions Name=Environment,Value=staging

# Expected: Metrics data points returned
```

#### 12.3 CloudWatch Alarms
```bash
# Check alarm status
aws cloudwatch describe-alarms \
  --alarm-name-prefix scorebase-staging \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table

# Expected: All alarms in OK state (not ALARM)
```

## Automated Smoke Test Script

Create a script to automate smoke tests:

```bash
#!/bin/bash
# smoke-test.sh

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-https://your-api-id.execute-api.us-east-1.amazonaws.com}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run test
run_test() {
  local test_name="$1"
  local command="$2"
  local expected_status="$3"
  
  echo -n "Testing: $test_name... "
  
  response=$(eval "$command")
  status=$(echo "$response" | head -n 1 | grep -oP 'HTTP/\d\.\d \K\d+')
  
  if [ "$status" == "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}FAIL${NC} (Expected: $expected_status, Got: $status)"
    ((TESTS_FAILED++))
  fi
}

# Run tests
echo "Starting smoke tests..."
echo "API Base URL: $API_BASE_URL"
echo ""

run_test "Missing JWT token returns 401" \
  "curl -s -i -X GET '$API_BASE_URL/v1/leagues'" \
  "401"

run_test "Valid JWT token returns 200" \
  "curl -s -i -X GET '$API_BASE_URL/v1/leagues' -H 'Authorization: Bearer $JWT_TOKEN'" \
  "200"

run_test "Non-existent league returns 404" \
  "curl -s -i -X GET '$API_BASE_URL/v1/leagues/00000000-0000-0000-0000-000000000000' -H 'Authorization: Bearer $JWT_TOKEN'" \
  "404"

# Summary
echo ""
echo "========================================="
echo "Smoke Test Summary"
echo "========================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "========================================="

if [ $TESTS_FAILED -gt 0 ]; then
  exit 1
fi
```

## Success Criteria

All smoke tests must pass before considering the deployment successful:

- [ ] All infrastructure components are active and healthy
- [ ] Authentication and authorization working correctly
- [ ] All API endpoints responding with correct status codes
- [ ] Data persistence working (RDS and DynamoDB)
- [ ] Event sourcing functioning correctly
- [ ] Standings calculation accurate
- [ ] Multi-tenant isolation enforced
- [ ] Error handling returning proper error responses
- [ ] Monitoring and logging systems operational
- [ ] No critical alarms triggered

## Troubleshooting Failed Smoke Tests

If smoke tests fail:

1. **Check CloudWatch Logs** for error messages
2. **Verify environment variables** are set correctly
3. **Check database connectivity** from Lambda
4. **Verify JWT token** is valid and not expired
5. **Review recent deployments** for configuration changes
6. **Check AWS Service Health Dashboard** for outages
7. **Rollback deployment** if issues persist

## Next Steps After Successful Smoke Tests

1. Monitor CloudWatch metrics for 24 hours
2. Review CloudWatch Logs for any warnings or errors
3. Perform load testing (if applicable)
4. Update documentation with any findings
5. Notify stakeholders of successful deployment
6. Schedule production deployment (if staging tests passed)

## Additional Resources

- [Deployment Guide](./deployment-guide.md)
- [API Documentation](./api-documentation.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Monitoring Dashboard](https://console.aws.amazon.com/cloudwatch/)
