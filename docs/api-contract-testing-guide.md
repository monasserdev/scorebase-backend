# API Contract Testing Guide

## Overview

API contract testing ensures that the backend API responses match the expectations of the iOS app. This guide covers implementing contract tests using consumer-driven contract testing principles.

## What is Contract Testing?

Contract testing validates that:
1. **Provider (Backend)** produces responses that match the contract
2. **Consumer (iOS App)** can consume the responses correctly
3. Changes to the API don't break existing consumers

## Benefits

- Catch breaking changes early in development
- Enable independent deployment of backend and iOS app
- Document API expectations from consumer perspective
- Reduce integration testing overhead
- Support API versioning and evolution

## Contract Testing Approach

We use a consumer-driven contract testing approach:

1. **iOS team defines contracts** based on their needs
2. **Backend team validates** their API against these contracts
3. **Contracts are versioned** and stored in the repository
4. **CI/CD runs contract tests** on every deployment

## Contract Definition Format

Contracts are defined using JSON Schema format:

```json
{
  "consumer": "ScoreBase-iOS",
  "provider": "ScoreBase-Backend-API",
  "version": "1.0.0",
  "interactions": [
    {
      "description": "Get all leagues for tenant",
      "request": {
        "method": "GET",
        "path": "/v1/leagues",
        "headers": {
          "Authorization": "Bearer <JWT_TOKEN>"
        }
      },
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "request_id": "<UUID>",
          "timestamp": "<ISO8601>",
          "data": [
            {
              "league_id": "<UUID>",
              "tenant_id": "<UUID>",
              "name": "<STRING>",
              "sport_type": "<ENUM: basketball|soccer|hockey|baseball|football>",
              "logo_url": "<URL|null>",
              "primary_color": "<HEX_COLOR|null>",
              "secondary_color": "<HEX_COLOR|null>",
              "created_at": "<ISO8601>",
              "updated_at": "<ISO8601>"
            }
          ]
        }
      }
    }
  ]
}
```

## Directory Structure

```
contracts/
├── README.md
├── ios-consumer/
│   ├── leagues.json
│   ├── seasons.json
│   ├── teams.json
│   ├── players.json
│   ├── games.json
│   ├── events.json
│   └── standings.json
└── provider-tests/
    ├── contract-validator.ts
    └── contract-tests.test.ts
```

## Example Contract: Get Leagues

### Contract Definition

```json
{
  "consumer": "ScoreBase-iOS",
  "provider": "ScoreBase-Backend-API",
  "version": "1.0.0",
  "description": "Contract for fetching leagues",
  "interactions": [
    {
      "id": "get-leagues",
      "description": "Get all leagues for authenticated tenant",
      "request": {
        "method": "GET",
        "path": "/v1/leagues",
        "headers": {
          "Authorization": "Bearer <JWT_TOKEN>",
          "Content-Type": "application/json"
        }
      },
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "type": "object",
          "required": ["request_id", "timestamp", "data"],
          "properties": {
            "request_id": {
              "type": "string",
              "format": "uuid"
            },
            "timestamp": {
              "type": "string",
              "format": "date-time"
            },
            "data": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "league_id",
                  "tenant_id",
                  "name",
                  "sport_type",
                  "created_at",
                  "updated_at"
                ],
                "properties": {
                  "league_id": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "tenant_id": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 255
                  },
                  "sport_type": {
                    "type": "string",
                    "enum": ["basketball", "soccer", "hockey", "baseball", "football"]
                  },
                  "logo_url": {
                    "type": ["string", "null"],
                    "format": "uri"
                  },
                  "primary_color": {
                    "type": ["string", "null"],
                    "pattern": "^#[0-9A-Fa-f]{6}$"
                  },
                  "secondary_color": {
                    "type": ["string", "null"],
                    "pattern": "^#[0-9A-Fa-f]{6}$"
                  },
                  "created_at": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "updated_at": {
                    "type": "string",
                    "format": "date-time"
                  }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

## Provider-Side Contract Tests

### Contract Validator

```typescript
// contracts/provider-tests/contract-validator.ts

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

export interface Contract {
  consumer: string;
  provider: string;
  version: string;
  description: string;
  interactions: Interaction[];
}

export interface Interaction {
  id: string;
  description: string;
  request: Request;
  response: Response;
}

export interface Request {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface Response {
  status: number;
  headers?: Record<string, string>;
  body: any;
}

export class ContractValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  loadContract(contractPath: string): Contract {
    const contractData = fs.readFileSync(contractPath, 'utf-8');
    return JSON.parse(contractData);
  }

  validateResponse(responseBody: any, expectedSchema: any): { valid: boolean; errors: any[] } {
    const validate = this.ajv.compile(expectedSchema);
    const valid = validate(responseBody);

    return {
      valid: valid as boolean,
      errors: validate.errors || [],
    };
  }

  validateAllContracts(contractsDir: string): ContractValidationResult[] {
    const results: ContractValidationResult[] = [];
    const contractFiles = fs.readdirSync(contractsDir).filter(f => f.endsWith('.json'));

    for (const file of contractFiles) {
      const contractPath = path.join(contractsDir, file);
      const contract = this.loadContract(contractPath);
      
      results.push({
        contractFile: file,
        consumer: contract.consumer,
        provider: contract.provider,
        version: contract.version,
        interactions: contract.interactions.length,
      });
    }

    return results;
  }
}

export interface ContractValidationResult {
  contractFile: string;
  consumer: string;
  provider: string;
  version: string;
  interactions: number;
}
```

### Contract Tests

```typescript
// contracts/provider-tests/contract-tests.test.ts

import { ContractValidator } from './contract-validator';
import axios from 'axios';
import * as path from 'path';

const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.scorebase.com/v1';
const TEST_JWT_TOKEN = process.env.TEST_JWT_TOKEN || '';

describe('API Contract Tests', () => {
  let validator: ContractValidator;
  let apiClient: any;

  beforeAll(() => {
    validator = new ContractValidator();
    
    apiClient = axios.create({
      baseURL: STAGING_API_URL,
      headers: {
        'Authorization': `Bearer ${TEST_JWT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  });

  describe('Leagues Contract', () => {
    it('should match contract for GET /v1/leagues', async () => {
      const contractPath = path.join(__dirname, '../ios-consumer/leagues.json');
      const contract = validator.loadContract(contractPath);
      const interaction = contract.interactions.find(i => i.id === 'get-leagues');

      if (!interaction) {
        throw new Error('Interaction not found');
      }

      // Make actual API request
      const response = await apiClient.get(interaction.request.path);

      // Validate status code
      expect(response.status).toBe(interaction.response.status);

      // Validate response body against schema
      const validation = validator.validateResponse(response.data, interaction.response.body);

      if (!validation.valid) {
        console.error('Contract validation errors:', JSON.stringify(validation.errors, null, 2));
      }

      expect(validation.valid).toBe(true);
    });

    it('should match contract for GET /v1/leagues/{leagueId}', async () => {
      // First get a league ID
      const leaguesResponse = await apiClient.get('/leagues');
      if (leaguesResponse.data.data.length === 0) {
        console.warn('No leagues available for testing');
        return;
      }

      const leagueId = leaguesResponse.data.data[0].league_id;

      const contractPath = path.join(__dirname, '../ios-consumer/leagues.json');
      const contract = validator.loadContract(contractPath);
      const interaction = contract.interactions.find(i => i.id === 'get-league-by-id');

      if (!interaction) {
        throw new Error('Interaction not found');
      }

      // Make actual API request
      const response = await apiClient.get(`/leagues/${leagueId}`);

      // Validate response
      const validation = validator.validateResponse(response.data, interaction.response.body);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Seasons Contract', () => {
    it('should match contract for GET /v1/seasons/{seasonId}', async () => {
      // Get a season ID
      const leaguesResponse = await apiClient.get('/leagues');
      if (leaguesResponse.data.data.length === 0) {
        console.warn('No leagues available');
        return;
      }

      const leagueId = leaguesResponse.data.data[0].league_id;
      const seasonsResponse = await apiClient.get(`/leagues/${leagueId}/seasons`);
      
      if (seasonsResponse.data.data.length === 0) {
        console.warn('No seasons available');
        return;
      }

      const seasonId = seasonsResponse.data.data[0].season_id;

      const contractPath = path.join(__dirname, '../ios-consumer/seasons.json');
      const contract = validator.loadContract(contractPath);
      const interaction = contract.interactions.find(i => i.id === 'get-season-by-id');

      if (!interaction) {
        throw new Error('Interaction not found');
      }

      const response = await apiClient.get(`/seasons/${seasonId}`);
      const validation = validator.validateResponse(response.data, interaction.response.body);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Error Response Contracts', () => {
    it('should match contract for 404 Not Found', async () => {
      const contractPath = path.join(__dirname, '../ios-consumer/errors.json');
      const contract = validator.loadContract(contractPath);
      const interaction = contract.interactions.find(i => i.id === 'error-404');

      if (!interaction) {
        throw new Error('Interaction not found');
      }

      try {
        await apiClient.get('/leagues/00000000-0000-0000-0000-000000000000');
        fail('Expected 404 error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        
        const validation = validator.validateResponse(
          error.response.data,
          interaction.response.body
        );
        expect(validation.valid).toBe(true);
      }
    });

    it('should match contract for 401 Unauthorized', async () => {
      const unauthClient = axios.create({
        baseURL: STAGING_API_URL,
      });

      const contractPath = path.join(__dirname, '../ios-consumer/errors.json');
      const contract = validator.loadContract(contractPath);
      const interaction = contract.interactions.find(i => i.id === 'error-401');

      if (!interaction) {
        throw new Error('Interaction not found');
      }

      try {
        await unauthClient.get('/leagues');
        fail('Expected 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
        
        const validation = validator.validateResponse(
          error.response.data,
          interaction.response.body
        );
        expect(validation.valid).toBe(true);
      }
    });
  });
});
```

## Consumer-Side Contract Tests (iOS)

### Swift Contract Validator

```swift
// Packages/core-networking/Tests/CoreNetworkingTests/ContractTests.swift

import XCTest
@testable import CoreNetworking
@testable import CoreModels

class ContractTests: XCTestCase {
    var apiClient: ScoreBaseAPIClient!
    
    override func setUp() {
        super.setUp()
        
        let config = APIConfiguration(environment: .staging)
        let authManager = MockAuthenticationManager()
        apiClient = ScoreBaseAPIClient(
            configuration: config,
            authManager: authManager
        )
    }
    
    func testLeaguesResponseMatchesContract() async throws {
        // Make actual API request
        let (leagues, requestId): ([League], String) = try await apiClient.request(GetLeaguesEndpoint())
        
        // Verify response structure matches contract
        XCTAssertFalse(requestId.isEmpty, "request_id should not be empty")
        XCTAssertFalse(leagues.isEmpty, "Should have at least one league")
        
        // Verify each league matches contract
        for league in leagues {
            XCTAssertFalse(league.id.isEmpty, "league_id should not be empty")
            XCTAssertFalse(league.tenantId.isEmpty, "tenant_id should not be empty")
            XCTAssertFalse(league.name.isEmpty, "name should not be empty")
            XCTAssertTrue(
                ["basketball", "soccer", "hockey", "baseball", "football"].contains(league.sportType.rawValue),
                "sport_type should be valid enum value"
            )
        }
    }
    
    func testErrorResponseMatchesContract() async throws {
        // Request non-existent resource
        do {
            let _: League = try await apiClient.request(
                GetLeagueByIdEndpoint(leagueId: "00000000-0000-0000-0000-000000000000")
            )
            XCTFail("Expected error")
        } catch let error as APIError {
            // Verify error structure matches contract
            switch error {
            case .notFound(let message, let requestId):
                XCTAssertFalse(message.isEmpty, "Error message should not be empty")
                XCTAssertFalse(requestId.isEmpty, "request_id should not be empty")
            default:
                XCTFail("Expected notFound error")
            }
        }
    }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/contract-tests.yml
name: API Contract Tests

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run contract tests
        env:
          STAGING_API_URL: ${{ secrets.STAGING_API_URL }}
          TEST_JWT_TOKEN: ${{ secrets.TEST_JWT_TOKEN }}
        run: npm run test:contracts
      
      - name: Upload contract test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: contract-test-results
          path: contract-test-results.json
```

## Contract Versioning

### Version Strategy

- **Major version**: Breaking changes (field removal, type changes)
- **Minor version**: Non-breaking additions (new optional fields)
- **Patch version**: Documentation updates

### Example Version History

```
v1.0.0 - Initial contract
v1.1.0 - Added logo_url field (optional)
v1.2.0 - Added primary_color and secondary_color fields (optional)
v2.0.0 - Changed sport_type from string to enum (breaking)
```

## Best Practices

1. **Keep contracts simple**: Focus on what consumers actually use
2. **Version contracts**: Track changes over time
3. **Run in CI/CD**: Catch breaking changes early
4. **Document expectations**: Clear descriptions for each interaction
5. **Test both success and error cases**: Cover all response types
6. **Use realistic test data**: Match production data patterns
7. **Maintain backward compatibility**: Support multiple contract versions

## Troubleshooting

### Contract Validation Failures

If contract tests fail:
1. Check if API response structure changed
2. Verify field types match expectations
3. Check for missing required fields
4. Review enum values
5. Validate date/time formats

### Version Mismatches

If versions don't match:
1. Update contract version in iOS app
2. Deploy backend with new contract version
3. Run contract tests to verify compatibility
4. Update documentation

## Additional Resources

- [OpenAPI Specification](./openapi.yaml)
- [iOS Integration Guide](./ios-integration-guide.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Pact Documentation](https://docs.pact.io/)
