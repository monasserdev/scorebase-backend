# ScoreBase Backend API Documentation

## Overview

The ScoreBase Backend API provides comprehensive documentation through an interactive Swagger UI interface. The documentation includes all endpoints, request/response schemas, authentication requirements, and example requests.

## Accessing the Documentation

### Production
- **Interactive Docs**: https://api.scorebase.com/api-docs
- **OpenAPI YAML**: https://api.scorebase.com/api-docs/openapi.yaml
- **OpenAPI JSON**: https://api.scorebase.com/api-docs/openapi.json

### Staging
- **Interactive Docs**: https://api-staging.scorebase.com/api-docs
- **OpenAPI YAML**: https://api-staging.scorebase.com/api-docs/openapi.yaml
- **OpenAPI JSON**: https://api-staging.scorebase.com/api-docs/openapi.json

### Local Development
```bash
# Start the API locally
npm run dev

# Access documentation
open http://localhost:3000/api-docs
```

## Features

### Interactive API Explorer
- **Try It Out**: Test API endpoints directly from the browser
- **Authentication Flow**: Built-in support for JWT Bearer token authentication
- **Request/Response Examples**: See real examples for all endpoints
- **Schema Validation**: View detailed request and response schemas

### Authentication Testing

1. **Obtain JWT Token** from Cognito:
   ```bash
   aws cognito-idp initiate-auth \
     --auth-flow USER_PASSWORD_AUTH \
     --client-id YOUR_CLIENT_ID \
     --auth-parameters USERNAME=user@example.com,PASSWORD=YourPassword
   ```

2. **Use Token in Swagger UI**:
   - Click the "Authorize" button at the top
   - Enter: `Bearer YOUR_JWT_TOKEN`
   - Click "Authorize"
   - All subsequent requests will include the token

### Multi-Tenant Isolation

The documentation includes details about multi-tenant isolation:
- All requests are automatically scoped to `tenant_id` from JWT
- Cross-tenant data access is strictly prohibited
- Security violations are logged and monitored

## API Endpoints

### Leagues
- `GET /v1/leagues` - Get all leagues for tenant
- `GET /v1/leagues/{leagueId}` - Get league by ID
- `GET /v1/leagues/{leagueId}/seasons` - Get seasons for league
- `GET /v1/leagues/{leagueId}/teams` - Get teams for league

### Seasons
- `GET /v1/seasons/{seasonId}` - Get season by ID
- `GET /v1/seasons/{seasonId}/games` - Get games for season (with filters)
- `GET /v1/seasons/{seasonId}/standings` - Get standings for season

### Teams
- `GET /v1/teams/{teamId}` - Get team by ID
- `GET /v1/teams/{teamId}/players` - Get players for team

### Players
- `GET /v1/players/{playerId}` - Get player by ID

### Games
- `GET /v1/games/{gameId}` - Get game by ID
- `GET /v1/games/{gameId}/events` - Get events for game
- `POST /v1/games/{gameId}/events` - Create game event (scorekeeper role required)

### Event Types

The API supports the following event types for game event sourcing:
- `GAME_STARTED` - Game has started
- `GOAL_SCORED` - A goal was scored
- `PENALTY_ASSESSED` - A penalty was assessed
- `PERIOD_ENDED` - A period has ended
- `GAME_FINALIZED` - Game is finalized (triggers standings recalculation)
- `GAME_CANCELLED` - Game was cancelled
- `SCORE_CORRECTED` - Score correction

## Response Format

All successful responses follow this envelope:

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { ... }
}
```

## Error Format

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "details": { ... }
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | Insufficient permissions (e.g., scorekeeper role required) |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request payload |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Rate Limiting

- **Rate Limit**: 1000 requests per second per tenant
- **Burst Capacity**: 2000 requests
- **Headers**: Rate limit information included in response headers

## Pagination

Currently, the API does not implement pagination. All list endpoints return complete result sets. Pagination will be added in a future release when dataset sizes require it.

## Versioning

The API uses URL path versioning:
- Current version: `/v1/`
- Future versions: `/v2/`, `/v3/`, etc.

Breaking changes will be introduced in new versions. Non-breaking changes (new fields, new endpoints) may be added to existing versions.

## Deprecation Policy

- Minimum 6 months notice before deprecating any endpoint
- Deprecated endpoints will return a `Deprecation` header
- Migration guides provided for all breaking changes

## OpenAPI Specification

The OpenAPI 3.0 specification is available in two formats:

### YAML Format
```bash
curl https://api.scorebase.com/api-docs/openapi.yaml > openapi.yaml
```

### JSON Format
```bash
curl https://api.scorebase.com/api-docs/openapi.json > openapi.json
```

## Code Generation

You can generate client SDKs from the OpenAPI specification using tools like:

### Swift (iOS)
```bash
# Using OpenAPI Generator
openapi-generator-cli generate \
  -i https://api.scorebase.com/api-docs/openapi.yaml \
  -g swift5 \
  -o ./ScoreBaseAPIClient
```

### TypeScript
```bash
# Using OpenAPI Generator
openapi-generator-cli generate \
  -i https://api.scorebase.com/api-docs/openapi.yaml \
  -g typescript-axios \
  -o ./scorebase-api-client
```

### Other Languages
OpenAPI Generator supports 50+ languages and frameworks. See: https://openapi-generator.tech/docs/generators

## Local Development

To serve the documentation locally:

```bash
# Build the project
npm run build

# Start local server (if using a local dev server)
npm run dev

# Or serve the HTML file directly
cd docs
python3 -m http.server 8080
# Open http://localhost:8080/api-docs.html
```

## Updating the Documentation

When making API changes:

1. **Update OpenAPI Spec**: Edit `docs/openapi.yaml`
2. **Regenerate JSON**: Run `npx js-yaml docs/openapi.yaml > docs/openapi.json`
3. **Test Locally**: Open `docs/api-docs.html` in a browser
4. **Deploy**: Deploy the updated CDK stack

## Support

For API support or questions:
- **Email**: engineering@scorebase.com
- **GitHub Issues**: https://github.com/scorebase/backend/issues
- **Slack**: #api-support (internal)

## Additional Resources

- [Deployment Guide](./deployment-guide.md)
- [Security Configuration](./security-configuration.md)
- [Disaster Recovery](./disaster-recovery.md)
- [iOS Integration Guide](./ios-integration-guide.md) (coming soon)
