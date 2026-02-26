# ScoreBase iOS Integration Guide

## Overview

This guide provides comprehensive instructions for integrating the ScoreBase iOS app with the backend API. It covers authentication, API configuration, request/response handling, error management, and best practices.

## Table of Contents

1. [API Configuration](#api-configuration)
2. [Authentication with Cognito](#authentication-with-cognito)
3. [API Client Setup](#api-client-setup)
4. [Request/Response Format](#requestresponse-format)
5. [Error Handling](#error-handling)
6. [Multi-Tenant Isolation](#multi-tenant-isolation)
7. [Rate Limiting](#rate-limiting)
8. [Caching Strategy](#caching-strategy)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## API Configuration

### Base URL and Versioning

The API uses URL path versioning with the following base URLs:

**Production:**
```swift
let baseURL = "https://api.scorebase.com/v1"
```

**Staging:**
```swift
let baseURL = "https://api-staging.scorebase.com/v1"
```

**Local Development:**
```swift
let baseURL = "http://localhost:3000/v1"
```

### Environment Configuration

Create an environment configuration file in your `core-networking` package:

```swift
// Packages/core-networking/Sources/CoreNetworking/Configuration/APIEnvironment.swift

public enum APIEnvironment {
    case production
    case staging
    case development
    
    public var baseURL: URL {
        switch self {
        case .production:
            return URL(string: "https://api.scorebase.com/v1")!
        case .staging:
            return URL(string: "https://api-staging.scorebase.com/v1")!
        case .development:
            return URL(string: "http://localhost:3000/v1")!
        }
    }
}
```

---

## Authentication with Cognito

### Cognito Configuration

The backend uses Amazon Cognito for authentication. You'll need the following configuration:

**Production:**
- **User Pool ID**: `us-east-1_XXXXXXXXX` (from CDK output)
- **Client ID**: `your-client-id` (from CDK output)
- **Region**: `us-east-1`

**Staging:**
- **User Pool ID**: `us-east-1_YYYYYYYYY`
- **Client ID**: `your-staging-client-id`
- **Region**: `us-east-1`

### JWT Token Format

The JWT token includes the following claims:

```json
{
  "sub": "user-uuid",
  "cognito:username": "user@example.com",
  "custom:tenant_id": "tenant-uuid",
  "cognito:groups": ["scorekeeper", "admin"],
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Authentication Flow Example

```swift
// Packages/core-networking/Sources/CoreNetworking/Auth/CognitoAuthManager.swift

import AWSCognitoIdentityProvider

public class CognitoAuthManager: ObservableObject {
    @Published public var isAuthenticated = false
    @Published public var currentUser: User?
    
    private let userPoolID: String
    private let clientID: String
    private let region: String
    
    public init(userPoolID: String, clientID: String, region: String) {
        self.userPoolID = userPoolID
        self.clientID = clientID
        self.region = region
    }
    
    public func signIn(username: String, password: String) async throws -> String {
        // Use AWS SDK to authenticate
        // Return JWT token
        // Extract tenant_id from custom claims
        // Store token securely in Keychain
    }
    
    public func getAccessToken() async throws -> String {
        // Retrieve token from Keychain
        // Check if expired
        // Refresh if needed
        // Return valid token
    }
    
    public func signOut() {
        // Clear token from Keychain
        // Reset authentication state
    }
}
```

---

## API Client Setup

### Core API Client

Update your `core-networking` package to work with the backend:

```swift
// Packages/core-networking/Sources/CoreNetworking/APIClient.swift

public protocol APIClientProtocol {
    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T
}

public class ScoreBaseAPIClient: APIClientProtocol {
    private let baseURL: URL
    private let authManager: CognitoAuthManager
    private let session: URLSession
    
    public init(
        environment: APIEnvironment,
        authManager: CognitoAuthManager,
        session: URLSession = .shared
    ) {
        self.baseURL = environment.baseURL
        self.authManager = authManager
        self.session = session
    }
    
    public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        // Build URL
        let url = baseURL.appendingPathComponent(endpoint.path)
        
        // Create request
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        
        // Add JWT token
        let token = try await authManager.getAccessToken()
        request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
        
        // Add headers
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add body if needed
        if let body = endpoint.body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        
        // Make request
        let (data, response) = try await session.data(for: request)
        
        // Handle response
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        // Check status code
        guard (200...299).contains(httpResponse.statusCode) else {
            throw try handleErrorResponse(data: data, statusCode: httpResponse.statusCode)
        }
        
        // Decode response envelope
        let envelope = try JSONDecoder().decode(APIResponseEnvelope<T>.self, from: data)
        
        // Log request_id for debugging
        print("Request ID: \\(envelope.requestId)")
        
        return envelope.data
    }
}
```

---

## Request/Response Format

### Response Envelope

All successful responses follow this envelope format:

```swift
// Packages/core-networking/Sources/CoreNetworking/Models/APIResponseEnvelope.swift

public struct APIResponseEnvelope<T: Decodable>: Decodable {
    public let requestId: String
    public let timestamp: String
    public let data: T
    
    enum CodingKeys: String, CodingKey {
        case requestId = "request_id"
        case timestamp
        case data
    }
}
```

### Error Response

All error responses follow this format:

```swift
public struct APIErrorResponse: Decodable {
    public let error: APIErrorDetail
}

public struct APIErrorDetail: Decodable {
    public let code: String
    public let message: String
    public let requestId: String
    public let details: [String: String]?
    
    enum CodingKeys: String, CodingKey {
        case code
        case message
        case requestId = "request_id"
        case details
    }
}
```

### Example: Fetching Leagues

```swift
// Define endpoint
struct GetLeaguesEndpoint: APIEndpoint {
    var path: String { "/leagues" }
    var method: HTTPMethod { .get }
    var body: Encodable? { nil }
}

// Make request
let leagues: [League] = try await apiClient.request(GetLeaguesEndpoint())
```

---

## Error Handling

### Error Types

Map backend error codes to iOS errors:

```swift
public enum APIError: Error {
    case unauthorized(message: String, requestId: String)
    case forbidden(message: String, requestId: String)
    case notFound(message: String, requestId: String)
    case validationError(message: String, details: [String: String]?, requestId: String)
    case rateLimitExceeded(message: String, requestId: String)
    case serverError(message: String, requestId: String)
    case networkError(Error)
    case invalidResponse
    case decodingError(Error)
}
```

### Error Handling Function

```swift
private func handleErrorResponse(data: Data, statusCode: Int) throws -> APIError {
    let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
    
    let message = errorResponse?.error.message ?? "Unknown error"
    let requestId = errorResponse?.error.requestId ?? "unknown"
    let details = errorResponse?.error.details
    
    switch statusCode {
    case 401:
        return .unauthorized(message: message, requestId: requestId)
    case 403:
        return .forbidden(message: message, requestId: requestId)
    case 404:
        return .notFound(message: message, requestId: requestId)
    case 400:
        return .validationError(message: message, details: details, requestId: requestId)
    case 429:
        return .rateLimitExceeded(message: message, requestId: requestId)
    case 500...599:
        return .serverError(message: message, requestId: requestId)
    default:
        return .serverError(message: message, requestId: requestId)
    }
}
```

### Retry Strategy

Implement exponential backoff for retryable errors:

```swift
public func requestWithRetry<T: Decodable>(
    _ endpoint: APIEndpoint,
    maxRetries: Int = 3
) async throws -> T {
    var lastError: Error?
    
    for attempt in 0..<maxRetries {
        do {
            return try await request(endpoint)
        } catch let error as APIError {
            lastError = error
            
            // Only retry on server errors or network errors
            switch error {
            case .serverError, .networkError:
                let delay = pow(2.0, Double(attempt)) // Exponential backoff
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            default:
                throw error // Don't retry client errors
            }
        }
    }
    
    throw lastError ?? APIError.serverError(message: "Max retries exceeded", requestId: "unknown")
}
```


---

## Multi-Tenant Isolation

### Automatic Tenant Scoping

All API requests are automatically scoped to the `tenant_id` extracted from the JWT token. You don't need to include `tenant_id` in request bodies or query parameters.

**Backend Behavior:**
- Extracts `tenant_id` from JWT claims (`custom:tenant_id`)
- Filters all database queries by `tenant_id`
- Returns 404 if resource doesn't belong to tenant
- Logs security violations for cross-tenant access attempts

**iOS Implementation:**
```swift
// ✅ CORRECT - No tenant_id needed
let leagues = try await apiClient.request(GetLeaguesEndpoint())

// ❌ WRONG - Don't include tenant_id in requests
// The backend will ignore it and use the JWT claim instead
```

### Security Considerations

- Never cache data across different user sessions
- Clear all cached data on sign out
- Verify tenant_id matches expected value after authentication
- Report any cross-tenant data leakage immediately

---

## Rate Limiting

### Limits

- **Rate Limit**: 1000 requests per second per tenant
- **Burst Capacity**: 2000 requests

### Handling Rate Limits

```swift
// Check for rate limit errors
catch let error as APIError {
    switch error {
    case .rateLimitExceeded(let message, let requestId):
        // Show user-friendly message
        // Implement exponential backoff
        // Queue requests for later
        print("Rate limit exceeded: \\(message), Request ID: \\(requestId)")
    default:
        break
    }
}
```

### Best Practices

- Implement request queuing for bulk operations
- Use debouncing for search/filter operations
- Cache responses to reduce API calls
- Batch requests when possible (future enhancement)

---

## Caching Strategy

### Response Caching

Implement caching to reduce API calls and improve performance:

```swift
public class CachedAPIClient: APIClientProtocol {
    private let client: APIClientProtocol
    private let cache: NSCache<NSString, CacheEntry>
    
    public init(client: APIClientProtocol) {
        self.client = client
        self.cache = NSCache<NSString, CacheEntry>()
        self.cache.countLimit = 100
    }
    
    public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let cacheKey = endpoint.cacheKey as NSString
        
        // Check cache
        if let cached = cache.object(forKey: cacheKey),
           !cached.isExpired {
            return cached.data as! T
        }
        
        // Make request
        let data: T = try await client.request(endpoint)
        
        // Cache response
        let entry = CacheEntry(data: data, expiresAt: Date().addingTimeInterval(300)) // 5 min TTL
        cache.setObject(entry, forKey: cacheKey)
        
        return data
    }
}

class CacheEntry {
    let data: Any
    let expiresAt: Date
    
    var isExpired: Bool {
        Date() > expiresAt
    }
    
    init(data: Any, expiresAt: Date) {
        self.data = data
        self.expiresAt = expiresAt
    }
}
```

### Cache Invalidation

Invalidate cache on:
- User sign out
- Data mutations (POST requests)
- Explicit refresh actions
- Cache expiration (TTL)

```swift
public func invalidateCache() {
    cache.removeAllObjects()
}

public func invalidateCache(for endpoint: APIEndpoint) {
    cache.removeObject(forKey: endpoint.cacheKey as NSString)
}
```

---

## Testing

### Unit Testing API Client

```swift
import XCTest
@testable import CoreNetworking

class APIClientTests: XCTestCase {
    var mockSession: URLSession!
    var apiClient: ScoreBaseAPIClient!
    var mockAuthManager: MockCognitoAuthManager!
    
    override func setUp() {
        super.setUp()
        
        // Configure mock session
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        mockSession = URLSession(configuration: configuration)
        
        // Create mock auth manager
        mockAuthManager = MockCognitoAuthManager()
        
        // Create API client
        apiClient = ScoreBaseAPIClient(
            environment: .development,
            authManager: mockAuthManager,
            session: mockSession
        )
    }
    
    func testFetchLeaguesSuccess() async throws {
        // Mock response
        let mockResponse = """
        {
            "request_id": "test-request-id",
            "timestamp": "2024-01-15T10:30:00Z",
            "data": [
                {
                    "league_id": "league-123",
                    "tenant_id": "tenant-456",
                    "name": "Test League",
                    "sport_type": "basketball"
                }
            ]
        }
        """
        
        MockURLProtocol.mockData = mockResponse.data(using: .utf8)
        MockURLProtocol.mockStatusCode = 200
        
        // Make request
        let leagues: [League] = try await apiClient.request(GetLeaguesEndpoint())
        
        // Verify
        XCTAssertEqual(leagues.count, 1)
        XCTAssertEqual(leagues[0].name, "Test League")
    }
    
    func testUnauthorizedError() async throws {
        // Mock error response
        let mockResponse = """
        {
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Invalid JWT token",
                "request_id": "test-request-id"
            }
        }
        """
        
        MockURLProtocol.mockData = mockResponse.data(using: .utf8)
        MockURLProtocol.mockStatusCode = 401
        
        // Make request and expect error
        do {
            let _: [League] = try await apiClient.request(GetLeaguesEndpoint())
            XCTFail("Expected unauthorized error")
        } catch let error as APIError {
            if case .unauthorized(let message, let requestId) = error {
                XCTAssertEqual(message, "Invalid JWT token")
                XCTAssertEqual(requestId, "test-request-id")
            } else {
                XCTFail("Expected unauthorized error, got \\(error)")
            }
        }
    }
}
```

### Integration Testing

```swift
class APIIntegrationTests: XCTestCase {
    var apiClient: ScoreBaseAPIClient!
    
    override func setUp() {
        super.setUp()
        
        // Use staging environment for integration tests
        let authManager = CognitoAuthManager(
            userPoolID: "us-east-1_STAGING",
            clientID: "staging-client-id",
            region: "us-east-1"
        )
        
        apiClient = ScoreBaseAPIClient(
            environment: .staging,
            authManager: authManager
        )
    }
    
    func testEndToEndLeagueFetch() async throws {
        // Authenticate
        let token = try await apiClient.authManager.signIn(
            username: "test@example.com",
            password: "TestPassword123!"
        )
        
        XCTAssertFalse(token.isEmpty)
        
        // Fetch leagues
        let leagues: [League] = try await apiClient.request(GetLeaguesEndpoint())
        
        // Verify
        XCTAssertGreaterThan(leagues.count, 0)
        XCTAssertNotNil(leagues[0].leagueId)
        XCTAssertNotNil(leagues[0].tenantId)
    }
}
```

---

## Troubleshooting

### Common Issues

#### 1. 401 Unauthorized Error

**Symptoms:**
```
APIError.unauthorized(message: "Invalid JWT token", requestId: "...")
```

**Solutions:**
- Verify JWT token is not expired
- Check token is included in Authorization header
- Verify Cognito User Pool ID and Client ID are correct
- Ensure token includes required claims (tenant_id, user_id)

#### 2. 403 Forbidden Error

**Symptoms:**
```
APIError.forbidden(message: "Scorekeeper role required", requestId: "...")
```

**Solutions:**
- Verify user has required role in Cognito groups
- Check endpoint requires specific role (e.g., POST /games/{gameId}/events)
- Contact admin to assign appropriate role

#### 3. 404 Not Found Error

**Symptoms:**
```
APIError.notFound(message: "League not found", requestId: "...")
```

**Solutions:**
- Verify resource ID is correct
- Check resource belongs to authenticated tenant
- Verify resource exists in database

#### 4. Network Timeout

**Symptoms:**
```
APIError.networkError(URLError(.timedOut))
```

**Solutions:**
- Check internet connectivity
- Verify API endpoint is accessible
- Increase timeout duration for slow connections
- Check for API Gateway throttling

#### 5. Decoding Error

**Symptoms:**
```
APIError.decodingError(DecodingError.keyNotFound(...))
```

**Solutions:**
- Verify DTO models match backend response format
- Check for API version mismatch
- Update DTOs to match OpenAPI specification
- Use optional properties for nullable fields

### Debugging Tips

#### Enable Request Logging

```swift
public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
    #if DEBUG
    print("🌐 Request: \\(endpoint.method.rawValue) \\(endpoint.path)")
    if let body = endpoint.body {
        let data = try JSONEncoder().encode(body)
        print("📤 Body: \\(String(data: data, encoding: .utf8) ?? "")")
    }
    #endif
    
    // ... make request ...
    
    #if DEBUG
    print("📥 Response: \\(httpResponse.statusCode)")
    print("📋 Request ID: \\(envelope.requestId)")
    #endif
    
    return envelope.data
}
```

#### Use Request ID for Support

Always include the `request_id` when reporting issues:

```swift
catch let error as APIError {
    let requestId = error.requestId ?? "unknown"
    print("Error occurred. Request ID: \\(requestId)")
    // Include request_id in bug reports or support tickets
}
```

#### Test with Staging Environment

Always test integration changes in staging before production:

```swift
#if DEBUG
let environment: APIEnvironment = .staging
#else
let environment: APIEnvironment = .production
#endif
```

---

## Additional Resources

- [OpenAPI Specification](./openapi.yaml)
- [API Documentation](./API_DOCUMENTATION.md)
- [Backend Architecture](../README.md)
- [Security Configuration](./security-configuration.md)
- [Deployment Guide](./deployment-guide.md)

## Support

For iOS integration support:
- **Email**: engineering@scorebase.com
- **Slack**: #ios-backend-integration (internal)
- **GitHub Issues**: https://github.com/scorebase/backend/issues

---

**Document Version:** 1.0.0  
**Last Updated:** January 2024  
**Author:** ScoreBase Engineering Team
