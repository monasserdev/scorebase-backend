# End-to-End Integration Tests

## Overview

These tests validate the complete integration between the iOS app and the ScoreBase backend API, including authentication, data fetching, event creation, and error handling.

## Prerequisites

### 1. Backend Deployment

The backend must be deployed to a staging environment:

```bash
npm run deploy:staging
```

### 2. Cognito Configuration

You need a Cognito User Pool with test users configured. The test user should have:
- Valid username and password
- `custom:tenant_id` attribute set
- Test data seeded in the database for their tenant

### 3. Environment Variables

Create a `.env.test` file in the project root:

```bash
# API Configuration
STAGING_API_URL=https://api-staging.scorebase.com/v1

# Cognito Configuration
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=your-client-id
AWS_REGION=us-east-1

# Test User Credentials
TEST_USERNAME=test@example.com
TEST_PASSWORD=TestPassword123!
```

**IMPORTANT:** Never commit `.env.test` to version control. Add it to `.gitignore`.

## Running the Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run with Environment Variables

```bash
STAGING_API_URL=https://api-staging.scorebase.com/v1 \
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX \
COGNITO_CLIENT_ID=your-client-id \
TEST_USERNAME=test@example.com \
TEST_PASSWORD=TestPassword123! \
npm run test:e2e
```

### Run Specific Test Suite

```bash
npm run test:e2e -- --testNamePattern="Authentication Flow"
```

## Test Coverage

The E2E tests cover the following scenarios:

### 1. Authentication Flow
- ✅ Authenticate with Cognito and receive valid JWT token
- ✅ Extract tenant_id from JWT claims
- ✅ Extract user_id from JWT claims
- ✅ Reject requests without JWT token (401)
- ✅ Reject requests with invalid JWT token (401)

### 2. Fetching Data
- ✅ Fetch leagues from backend
- ✅ Fetch league by ID
- ✅ Fetch seasons for league
- ✅ Fetch teams for league
- ✅ Fetch players for team

### 3. Creating Games and Events
- ✅ Fetch games for season
- ✅ Create GOAL_SCORED event (requires scorekeeper role)
- ✅ Fetch events for game

### 4. Standings Verification
- ✅ Fetch standings for season
- ✅ Verify standings calculations:
  - games_played = wins + losses + ties
  - points = (wins × 3) + (ties × 1)
  - goal_differential = goals_for - goals_against

### 5. Error Handling
- ✅ Return 404 for non-existent resources
- ✅ Return 400 for invalid event payload
- ✅ Return 401 for missing/invalid authentication
- ✅ Return 403 for insufficient permissions

### 6. Multi-Tenant Isolation
- ✅ Only return data for authenticated tenant
- ✅ Return 404 when accessing resources from different tenant
- ✅ Verify all returned data belongs to authenticated tenant

### 7. Offline Behavior
- ✅ Handle network timeout gracefully
- ✅ Retry on 500 errors with exponential backoff

## Test Data Setup

### Seeding Test Data

Before running E2E tests, seed the database with test data:

```sql
-- Create test tenant
INSERT INTO tenants (tenant_id, name, subscription_tier, max_leagues)
VALUES ('test-tenant-id', 'Test Tenant', 'standard', 10);

-- Create test league
INSERT INTO leagues (league_id, tenant_id, name, sport_type)
VALUES ('test-league-id', 'test-tenant-id', 'Test League', 'basketball');

-- Create test season
INSERT INTO seasons (season_id, league_id, name, start_date, end_date, is_active)
VALUES ('test-season-id', 'test-league-id', '2024 Season', '2024-01-01', '2024-12-31', true);

-- Create test teams
INSERT INTO teams (team_id, league_id, name)
VALUES 
  ('test-team-1', 'test-league-id', 'Team A'),
  ('test-team-2', 'test-league-id', 'Team B');

-- Create test players
INSERT INTO players (player_id, team_id, first_name, last_name, jersey_number)
VALUES 
  ('test-player-1', 'test-team-1', 'John', 'Doe', '10'),
  ('test-player-2', 'test-team-2', 'Jane', 'Smith', '23');

-- Create test game
INSERT INTO games (game_id, season_id, home_team_id, away_team_id, scheduled_at, status, home_score, away_score)
VALUES ('test-game-id', 'test-season-id', 'test-team-1', 'test-team-2', '2024-01-15 19:00:00', 'scheduled', 0, 0);
```

### Creating Test User in Cognito

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=custom:tenant_id,Value=test-tenant-id \
  --temporary-password TempPassword123! \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username test@example.com \
  --password TestPassword123! \
  --permanent

# Add user to scorekeeper group (for event creation tests)
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username test@example.com \
  --group-name scorekeeper
```

## CI/CD Integration

### GitHub Actions

Add E2E tests to your CI/CD pipeline:

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        env:
          STAGING_API_URL: ${{ secrets.STAGING_API_URL }}
          COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
          COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
          TEST_USERNAME: ${{ secrets.TEST_USERNAME }}
          TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
          AWS_REGION: us-east-1
        run: npm run test:e2e
```

## Troubleshooting

### Tests Skipped

If tests are skipped with "Cognito configuration not provided":
- Verify environment variables are set correctly
- Check that `.env.test` file exists and is loaded
- Ensure `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` are not empty

### Authentication Failures

If authentication fails:
- Verify test user exists in Cognito User Pool
- Check username and password are correct
- Ensure user has `custom:tenant_id` attribute set
- Verify user is not in a disabled state

### 404 Errors

If tests fail with 404 errors:
- Verify test data is seeded in the database
- Check that tenant_id in Cognito matches tenant_id in database
- Ensure API Gateway endpoint is correct

### 403 Forbidden Errors

If event creation tests fail with 403:
- Verify test user is in the `scorekeeper` Cognito group
- Check that role-based authorization is configured correctly
- This is expected if the test user doesn't have scorekeeper role

### Network Timeouts

If tests timeout:
- Increase timeout in test configuration
- Check that staging API is accessible
- Verify VPC and security group configurations
- Check Lambda cold start times

## Best Practices

1. **Isolate Test Data**: Use dedicated test tenant and test data
2. **Clean Up**: Remove test data after tests complete
3. **Idempotent Tests**: Tests should be repeatable without side effects
4. **Parallel Execution**: Use `--runInBand` to run tests sequentially
5. **Environment Separation**: Never run E2E tests against production
6. **Secrets Management**: Use environment variables, never hardcode credentials
7. **Test Data Versioning**: Keep test data in sync with schema changes

## Maintenance

### Updating Tests

When adding new API endpoints:
1. Add test cases to appropriate describe block
2. Update test data seeding scripts
3. Document any new environment variables needed
4. Update this README with new test coverage

### Monitoring

Monitor E2E test results:
- Track test execution time
- Monitor failure rates
- Alert on consistent failures
- Review test logs regularly

## Additional Resources

- [iOS Integration Guide](../../docs/ios-integration-guide.md)
- [API Documentation](../../docs/API_DOCUMENTATION.md)
- [Deployment Guide](../../docs/deployment-guide.md)
- [Backend Architecture](../../README.md)
