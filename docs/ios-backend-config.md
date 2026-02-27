# ScoreBase iOS Backend Configuration

## Deployed Backend Details

Your ScoreBase backend is now live and ready for iOS integration!

### API Configuration

**Base URL (Staging):**
```swift
let baseURL = "https://9bp89zkwlb.execute-api.us-east-1.amazonaws.com/v1"
```

### Cognito Configuration

**User Pool ID:**
```swift
let userPoolID = "us-east-1_6PgWxgfqD"
```

**Client ID:**
```swift
let clientID = "56nhep6uo8oo4j5gnbib04t0u4"
```

**Region:**
```swift
let region = "us-east-1"
```

### Test User Credentials

For testing the integration, use these credentials:

**Username:** `testuser`  
**Password:** `TestPassword123!`  
**Tenant ID:** `A540567C-16A5-49DE-9BDD-47F272F08386` (automatically extracted from JWT)

---

## Quick Start Integration

### Step 1: Update APIEnvironment.swift

```swift
// Packages/core-networking/Sources/CoreNetworking/Configuration/APIEnvironment.swift

public enum APIEnvironment {
    case production
    case staging
    case development
    
    public var baseURL: URL {
        switch self {
        case .production:
            return URL(string: "https://9bp89zkwlb.execute-api.us-east-1.amazonaws.com/v1")!
        case .staging:
            return URL(string: "https://9bp89zkwlb.execute-api.us-east-1.amazonaws.com/v1")!
        case .development:
            return URL(string: "http://localhost:3000/v1")!
        }
    }
}
```

### Step 2: Configure Cognito

```swift
// Packages/core-networking/Sources/CoreNetworking/Configuration/CognitoConfig.swift

public struct CognitoConfig {
    public static let userPoolID = "us-east-1_6PgWxgfqD"
    public static let clientID = "56nhep6uo8oo4j5gnbib04t0u4"
    public static let region = "us-east-1"
}
```

### Step 3: Initialize API Client

```swift
// In your app initialization (e.g., ScoreBaseApp.swift)

import CoreNetworking

@main
struct ScoreBaseApp: App {
    @StateObject private var authManager = CognitoAuthManager(
        userPoolID: CognitoConfig.userPoolID,
        clientID: CognitoConfig.clientID,
        region: CognitoConfig.region
    )
    
    @StateObject private var apiClient: ScoreBaseAPIClient
    
    init() {
        let authManager = CognitoAuthManager(
            userPoolID: CognitoConfig.userPoolID,
            clientID: CognitoConfig.clientID,
            region: CognitoConfig.region
        )
        
        _authManager = StateObject(wrappedValue: authManager)
        
        _apiClient = StateObject(wrappedValue: ScoreBaseAPIClient(
            environment: .staging,
            authManager: authManager
        ))
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(apiClient)
        }
    }
}
```

---

## Testing the Connection

### Test 1: Authentication

```swift
// Test authentication with the test user
do {
    let token = try await authManager.signIn(
        username: "testuser",
        password: "TestPassword123!"
    )
    print("✅ Authentication successful!")
    print("Token: \(token.prefix(20))...")
} catch {
    print("❌ Authentication failed: \(error)")
}
```

### Test 2: Fetch Leagues

```swift
// Test fetching leagues (should return empty array initially)
do {
    let response: LeaguesResponse = try await apiClient.request(GetLeaguesEndpoint())
    print("✅ API call successful!")
    print("Leagues count: \(response.leagues.count)")
} catch {
    print("❌ API call failed: \(error)")
}
```

### Expected Response Format

```json
{
  "request_id": "a5ed4b3c-f162-4189-869b-7faef986e470",
  "timestamp": "2026-02-27T01:52:47.569Z",
  "data": {
    "leagues": []
  }
}
```

---

## Available Endpoints

All endpoints are now live and ready to use:

### Leagues
- `GET /v1/leagues` - Get all leagues for tenant
- `GET /v1/leagues/{leagueId}` - Get specific league

### Seasons
- `GET /v1/leagues/{leagueId}/seasons` - Get seasons for a league
- `GET /v1/seasons/{seasonId}` - Get specific season
- `GET /v1/seasons/{seasonId}/games` - Get games for a season
- `GET /v1/seasons/{seasonId}/standings` - Get standings for a season

### Teams
- `GET /v1/leagues/{leagueId}/teams` - Get teams for a league
- `GET /v1/teams/{teamId}` - Get specific team
- `GET /v1/teams/{teamId}/players` - Get players for a team

### Players
- `GET /v1/players/{playerId}` - Get specific player

### Games
- `GET /v1/games/{gameId}` - Get specific game
- `GET /v1/games/{gameId}/events` - Get events for a game
- `POST /v1/games/{gameId}/events` - Create game event (requires scorekeeper role)

---

## Response Models

### League Response

```swift
public struct LeaguesResponse: Decodable {
    public let leagues: [League]
}

public struct League: Decodable {
    public let leagueId: String
    public let tenantId: String
    public let name: String
    public let sportType: String
    public let logoUrl: String?
    public let primaryColor: String?
    public let secondaryColor: String?
    public let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case leagueId = "league_id"
        case tenantId = "tenant_id"
        case name
        case sportType = "sport_type"
        case logoUrl = "logo_url"
        case primaryColor = "primary_color"
        case secondaryColor = "secondary_color"
        case createdAt = "created_at"
    }
}
```

---

## Authentication Flow

### 1. Sign In

```swift
let token = try await authManager.signIn(
    username: "testuser",
    password: "TestPassword123!"
)
```

### 2. Token is Automatically Included

The API client automatically includes the JWT token in all requests:

```
Authorization: Bearer eyJraWQiOiJ...
```

### 3. Backend Extracts Tenant ID

The backend automatically:
- Validates the JWT token
- Extracts `custom:tenant_id` from claims
- Filters all queries by tenant ID
- Returns only data belonging to your tenant

**You never need to include tenant_id in your requests!**

---

## Error Handling

### Common Errors

**401 Unauthorized:**
```swift
APIError.unauthorized(
    message: "Invalid JWT token",
    requestId: "abc-123"
)
```
**Solution:** Token expired, re-authenticate

**403 Forbidden:**
```swift
APIError.forbidden(
    message: "Scorekeeper role required",
    requestId: "abc-123"
)
```
**Solution:** User doesn't have required role

**404 Not Found:**
```swift
APIError.notFound(
    message: "League not found",
    requestId: "abc-123"
)
```
**Solution:** Resource doesn't exist or doesn't belong to tenant

---

## Next Steps

1. **Install AWS SDK for Swift** (for Cognito authentication)
   ```swift
   // Package.swift
   dependencies: [
       .package(url: "https://github.com/awslabs/aws-sdk-swift", from: "0.30.0")
   ]
   ```

2. **Implement CognitoAuthManager** following the guide in `ios-integration-guide.md`

3. **Update your DTOs** to match the backend response format (snake_case to camelCase)

4. **Test authentication** with the test user credentials

5. **Test API calls** starting with `GET /v1/leagues`

6. **Create sample data** in the backend for testing (leagues, teams, games)

---

## Troubleshooting

### Issue: "Invalid JWT token"

**Check:**
- Token is not expired (1 hour validity)
- Token is included in Authorization header
- Format is `Bearer <token>`

### Issue: "Network timeout"

**Check:**
- API Gateway endpoint is correct
- Internet connectivity
- No firewall blocking AWS endpoints

### Issue: "Decoding error"

**Check:**
- DTO models match backend response format
- Using snake_case for CodingKeys
- Optional fields are marked as optional

---

## Support

For integration issues:
- Check CloudWatch logs for request_id
- Include request_id in bug reports
- Review `ios-integration-guide.md` for detailed examples

**Backend Status:** ✅ Deployed and operational  
**Database:** ✅ Schema initialized  
**Authentication:** ✅ Cognito configured  
**API Gateway:** ✅ Live and accepting requests

---

**Last Updated:** February 27, 2026  
**Environment:** Staging (us-east-1)
