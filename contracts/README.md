# API Contract Tests

## Overview

This directory contains API contract definitions and tests for the ScoreBase Backend API. Contract tests ensure that the backend API responses match the expectations of the iOS app.

## Directory Structure

```
contracts/
├── README.md                    # This file
├── ios-consumer/                # Contract definitions from iOS perspective
│   ├── leagues.json            # Leagues endpoint contracts
│   ├── seasons.json            # Seasons endpoint contracts
│   ├── teams.json              # Teams endpoint contracts
│   ├── players.json            # Players endpoint contracts
│   ├── games.json              # Games endpoint contracts
│   ├── events.json             # Events endpoint contracts
│   ├── standings.json          # Standings endpoint contracts
│   └── errors.json             # Error response contracts
└── provider-tests/              # Provider-side contract validation tests
    ├── contract-validator.ts   # Contract validation logic
    └── contract-tests.test.ts  # Contract test suite
```

## Contract Format

Each contract file follows this structure:

```json
{
  "consumer": "ScoreBase-iOS",
  "provider": "ScoreBase-Backend-API",
  "version": "1.0.0",
  "description": "Contract description",
  "interactions": [
    {
      "id": "unique-interaction-id",
      "description": "Interaction description",
      "request": {
        "method": "GET|POST|PUT|DELETE",
        "path": "/v1/endpoint",
        "headers": {},
        "body": {}
      },
      "response": {
        "status": 200,
        "headers": {},
        "body": {
          "type": "object",
          "properties": {}
        }
      }
    }
  ]
}
```

## Running Contract Tests

### Prerequisites

1. Backend deployed to staging environment
2. Valid JWT token for authentication
3. Test data seeded in database

### Run Tests

```bash
# Set environment variables
export STAGING_API_URL=https://api-staging.scorebase.com/v1
export TEST_JWT_TOKEN=your-jwt-token

# Run contract tests
npm run test:contracts
```

### Run Specific Contract

```bash
npm run test:contracts -- --testNamePattern="Leagues Contract"
```

## Adding New Contracts

### 1. Create Contract Definition

Create a new JSON file in `ios-consumer/`:

```json
{
  "consumer": "ScoreBase-iOS",
  "provider": "ScoreBase-Backend-API",
  "version": "1.0.0",
  "description": "Your contract description",
  "interactions": [
    {
      "id": "your-interaction-id",
      "description": "Your interaction description",
      "request": {
        "method": "GET",
        "path": "/v1/your-endpoint"
      },
      "response": {
        "status": 200,
        "body": {
          "type": "object",
          "required": ["request_id", "timestamp", "data"],
          "properties": {
            "request_id": { "type": "string", "format": "uuid" },
            "timestamp": { "type": "string", "format": "date-time" },
            "data": { "type": "object" }
          }
        }
      }
    }
  ]
}
```

### 2. Add Test Case

Add a test case in `provider-tests/contract-tests.test.ts`:

```typescript
describe('Your Contract', () => {
  it('should match contract for GET /v1/your-endpoint', async () => {
    const contractPath = path.join(__dirname, '../ios-consumer/your-contract.json');
    const contract = validator.loadContract(contractPath);
    const interaction = contract.interactions.find(i => i.id === 'your-interaction-id');

    const response = await apiClient.get(interaction.request.path);
    const validation = validator.validateResponse(response.data, interaction.response.body);
    
    expect(validation.valid).toBe(true);
  });
});
```

### 3. Run Tests

```bash
npm run test:contracts
```

## Contract Versioning

Contracts follow semantic versioning:

- **Major (1.0.0 → 2.0.0)**: Breaking changes (field removal, type changes)
- **Minor (1.0.0 → 1.1.0)**: Non-breaking additions (new optional fields)
- **Patch (1.0.0 → 1.0.1)**: Documentation updates

### Version History

Track version changes in each contract file:

```json
{
  "version": "1.1.0",
  "changelog": [
    {
      "version": "1.1.0",
      "date": "2024-01-15",
      "changes": ["Added logo_url field (optional)"]
    },
    {
      "version": "1.0.0",
      "date": "2024-01-01",
      "changes": ["Initial contract"]
    }
  ]
}
```

## CI/CD Integration

Contract tests run automatically in CI/CD:

```yaml
# .github/workflows/contract-tests.yml
- name: Run contract tests
  env:
    STAGING_API_URL: ${{ secrets.STAGING_API_URL }}
    TEST_JWT_TOKEN: ${{ secrets.TEST_JWT_TOKEN }}
  run: npm run test:contracts
```

## Best Practices

1. **Keep contracts simple**: Focus on what consumers actually use
2. **Version contracts**: Track changes over time
3. **Test both success and error cases**: Cover all response types
4. **Use realistic schemas**: Match production data patterns
5. **Document changes**: Maintain changelog in each contract
6. **Run in CI/CD**: Catch breaking changes early
7. **Coordinate with iOS team**: Ensure contracts match their needs

## Troubleshooting

### Contract Validation Failures

If tests fail:
1. Check API response structure
2. Verify field types match schema
3. Check for missing required fields
4. Review enum values
5. Validate date/time formats

### Authentication Issues

If authentication fails:
1. Verify JWT token is valid
2. Check token expiration
3. Ensure token has required claims
4. Verify API endpoint is correct

## Additional Resources

- [API Contract Testing Guide](../docs/api-contract-testing-guide.md)
- [OpenAPI Specification](../docs/openapi.yaml)
- [iOS Integration Guide](../docs/ios-integration-guide.md)
- [API Documentation](../docs/API_DOCUMENTATION.md)
