# iOS ScoreBaseAPIClient Update Guide

## Overview

This guide provides step-by-step instructions for updating the iOS `core-networking` package to integrate with the ScoreBase backend API. It covers base URL configuration, authentication, DTO updates, request_id tracking, error mapping, and caching strategy.

## Prerequisites

- iOS app with modular Swift Package Manager architecture
- `core-networking` package exists
- `core-models` package exists
- AWS Amplify or AWS SDK for Cognito integration

## Step 1: Update Base URL Configuration

### Location
`Packages/core-networking/Sources/CoreNetworking/Configuration/APIConfiguration.swift`

### Implementation

```swift
import Foundation

public struct APIConfiguration {
    public let baseURL: URL
    public let environment: Environment
    
    public enum Environment: String {
        case production = "https://api.scorebase.com/v1"
        case staging = "https://api-staging.scorebase.com/v1"
        case development = "http://localhost:3000/v1"
    }
    
    public init(environment: Environment) {
        self.environment = environment
        self.baseURL = URL(string: environment.rawValue)!
    }
    
    public static var current: APIConfiguration {
        #if DEBUG
        return APIConfiguration(environment: .staging)
        #else
        return APIConfiguration(environment: .production)
        #endif
    }
}
```

## Step 2: Implement Cognito Authentication

### Location
`Packages/core-networking/Sources/CoreNetworking/Auth/AuthenticationManager.swift`

### Implementation

```swift
import Foundation
import Combine

public protocol AuthenticationManagerProtocol {
    var isAuthenticated: Bool { get }
    var currentToken: String? { get }
    
    func signIn(username: String, password: String) async throws -> AuthToken
    func signOut()
    func refreshToken() async throws -> AuthToken
    func getValidToken() async throws -> String
}

public struct AuthToken {
    public let accessToken: String
    public let idToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let tenantId: String
    public let userId: String
    
    public var isExpired: Bool {
        Date() >= expiresAt
    }
}

public class CognitoAuthenticationManager: AuthenticationManagerProtocol {
    @Published public private(set) var isAuthenticated = false
    public private(set) var currentToken: String?
    
    private let userPoolId: String
    private let clientId: String
    private let region: String
    private var storedToken: AuthToken?
    
    public init(userPoolId: String, clientId: String, region: String) {
        self.userPoolId = userPoolId
        self.clientId = clientId
        self.region = region
        
        // Load stored token from Keychain
        loadStoredToken()
    }
    
    public func signIn(username: String, password: String) async throws -> AuthToken {
        // TODO: Implement AWS Cognito authentication
        // 1. Call Cognito InitiateAuth API
        // 2. Parse JWT tokens
        // 3. Extract tenant_id from custom claims
        // 4. Store tokens in Keychain
        // 5. Update isAuthenticated state
        
        fatalError("Implement Cognito authentication")
    }
    
    public func signOut() {
        // Clear tokens from Keychain
        clearStoredToken()
        storedToken = nil
        currentToken = nil
        isAuthenticated = false
    }
    
    public func refreshToken() async throws -> AuthToken {
        // TODO: Implement token refresh
        // 1. Use refresh token to get new access token
        // 2. Update stored token
        // 3. Return new token
        
        fatalError("Implement token refresh")
    }
    
    public func getValidToken() async throws -> String {
        // Check if current token is valid
        if let token = storedToken, !token.isExpired {
            return token.accessToken
        }
        
        // Refresh if expired
        let newToken = try await refreshToken()
        return newToken.accessToken
    }
    
    private func loadStoredToken() {
        // TODO: Load from Keychain
    }
    
    private func clearStoredToken() {
        // TODO: Clear from Keychain
    }
}
```

## Step 3: Update DTOs to Match Backend Response Format

### Location
`Packages/core-models/Sources/CoreModels/API/`

### Response Envelope

```swift
// Packages/core-models/Sources/CoreModels/API/APIResponseEnvelope.swift

import Foundation

public struct APIResponseEnvelope<T: Decodable>: Decodable {
    public let requestId: String
    public let timestamp: String
    public let data: T
    
    enum CodingKeys: String, CodingKey {
        case requestId = "request_id"
        case timestamp
        case data
    }
    
    public init(requestId: String, timestamp: String, data: T) {
        self.requestId = requestId
        self.timestamp = timestamp
        self.data = data
    }
}
```

### Error Response

```swift
// Packages/core-models/Sources/CoreModels/API/APIErrorResponse.swift

import Foundation

public struct APIErrorResponse: Decodable {
    public let error: ErrorDetail
    
    public struct ErrorDetail: Decodable {
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
}
```

### Update Domain Models

Update existing models to match backend field names:

```swift
// Packages/core-models/Sources/CoreModels/League.swift

import Foundation

public struct League: Codable, Identifiable {
    public let id: String  // Maps to league_id
    public let tenantId: String
    public let name: String
    public let sportType: SportType
    public let logoUrl: String?
    public let primaryColor: String?
    public let secondaryColor: String?
    public let createdAt: Date
    public let updatedAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id = "league_id"
        case tenantId = "tenant_id"
        case name
        case sportType = "sport_type"
        case logoUrl = "logo_url"
        case primaryColor = "primary_color"
        case secondaryColor = "secondary_color"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

public enum SportType: String, Codable {
    case basketball
    case soccer
    case hockey
    case baseball
    case football
}
```

## Step 4: Implement Request ID Tracking

### Location
`Packages/core-networking/Sources/CoreNetworking/APIClient.swift`

### Implementation

```swift
import Foundation
import CoreModels

public protocol APIClientProtocol {
    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> (data: T, requestId: String)
}

public class ScoreBaseAPIClient: APIClientProtocol {
    private let configuration: APIConfiguration
    private let authManager: AuthenticationManagerProtocol
    private let session: URLSession
    private let logger: APILogger
    
    public init(
        configuration: APIConfiguration,
        authManager: AuthenticationManagerProtocol,
        session: URLSession = .shared,
        logger: APILogger = DefaultAPILogger()
    ) {
        self.configuration = configuration
        self.authManager = authManager
        self.session = session
        self.logger = logger
    }
    
    public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> (data: T, requestId: String) {
        // Build URL
        let url = configuration.baseURL.appendingPathComponent(endpoint.path)
        var urlComponents = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        
        // Add query parameters
        if let queryParams = endpoint.queryParameters {
            urlComponents.queryItems = queryParams.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        
        guard let finalURL = urlComponents.url else {
            throw APIError.invalidURL
        }
        
        // Create request
        var request = URLRequest(url: finalURL)
        request.httpMethod = endpoint.method.rawValue
        
        // Add JWT token
        let token = try await authManager.getValidToken()
        request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
        
        // Add headers
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ScoreBase-iOS/1.0", forHTTPHeaderField: "User-Agent")
        
        // Add body if needed
        if let body = endpoint.body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        
        // Log request
        logger.logRequest(request, endpoint: endpoint)
        
        // Make request
        let startTime = Date()
        let (data, response) = try await session.data(for: request)
        let duration = Date().timeIntervalSince(startTime)
        
        // Handle response
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        // Check status code
        guard (200...299).contains(httpResponse.statusCode) else {
            let error = try handleErrorResponse(data: data, statusCode: httpResponse.statusCode)
            logger.logError(error, endpoint: endpoint, duration: duration)
            throw error
        }
        
        // Decode response envelope
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        
        let envelope = try decoder.decode(APIResponseEnvelope<T>.self, from: data)
        
        // Log success
        logger.logResponse(httpResponse, requestId: envelope.requestId, endpoint: endpoint, duration: duration)
        
        return (data: envelope.data, requestId: envelope.requestId)
    }
    
    private func handleErrorResponse(data: Data, statusCode: Int) throws -> APIError {
        let decoder = JSONDecoder()
        let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data)
        
        let code = errorResponse?.error.code ?? "UNKNOWN_ERROR"
        let message = errorResponse?.error.message ?? "An unknown error occurred"
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
            return .serverError(code: code, message: message, requestId: requestId)
        default:
            return .serverError(code: code, message: message, requestId: requestId)
        }
    }
}
```

## Step 5: Add Error Mapping

### Location
`Packages/core-networking/Sources/CoreNetworking/APIError.swift`

### Implementation

```swift
import Foundation

public enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized(message: String, requestId: String)
    case forbidden(message: String, requestId: String)
    case notFound(message: String, requestId: String)
    case validationError(message: String, details: [String: String]?, requestId: String)
    case rateLimitExceeded(message: String, requestId: String)
    case serverError(code: String, message: String, requestId: String)
    case networkError(Error)
    case decodingError(Error)
    
    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized(let message, _):
            return message
        case .forbidden(let message, _):
            return message
        case .notFound(let message, _):
            return message
        case .validationError(let message, _, _):
            return message
        case .rateLimitExceeded(let message, _):
            return message
        case .serverError(_, let message, _):
            return message
        case .networkError(let error):
            return "Network error: \\(error.localizedDescription)"
        case .decodingError(let error):
            return "Decoding error: \\(error.localizedDescription)"
        }
    }
    
    public var requestId: String? {
        switch self {
        case .unauthorized(_, let requestId),
             .forbidden(_, let requestId),
             .notFound(_, let requestId),
             .validationError(_, _, let requestId),
             .rateLimitExceeded(_, let requestId),
             .serverError(_, _, let requestId):
            return requestId
        default:
            return nil
        }
    }
    
    public var isRetryable: Bool {
        switch self {
        case .serverError, .networkError, .rateLimitExceeded:
            return true
        default:
            return false
        }
    }
}
```

## Step 6: Update Caching Strategy

### Location
`Packages/core-networking/Sources/CoreNetworking/Cache/APICache.swift`

### Implementation

```swift
import Foundation

public protocol APICacheProtocol {
    func get<T: Decodable>(for key: String) -> T?
    func set<T: Encodable>(_ value: T, for key: String, ttl: TimeInterval)
    func remove(for key: String)
    func clear()
}

public class InMemoryAPICache: APICacheProtocol {
    private var cache: [String: CacheEntry] = [:]
    private let queue = DispatchQueue(label: "com.scorebase.api.cache", attributes: .concurrent)
    
    private struct CacheEntry {
        let data: Data
        let expiresAt: Date
        
        var isExpired: Bool {
            Date() > expiresAt
        }
    }
    
    public init() {}
    
    public func get<T: Decodable>(for key: String) -> T? {
        queue.sync {
            guard let entry = cache[key], !entry.isExpired else {
                return nil
            }
            
            return try? JSONDecoder().decode(T.self, from: entry.data)
        }
    }
    
    public func set<T: Encodable>(_ value: T, for key: String, ttl: TimeInterval) {
        queue.async(flags: .barrier) {
            guard let data = try? JSONEncoder().encode(value) else {
                return
            }
            
            let entry = CacheEntry(
                data: data,
                expiresAt: Date().addingTimeInterval(ttl)
            )
            
            self.cache[key] = entry
        }
    }
    
    public func remove(for key: String) {
        queue.async(flags: .barrier) {
            self.cache.removeValue(forKey: key)
        }
    }
    
    public func clear() {
        queue.async(flags: .barrier) {
            self.cache.removeAll()
        }
    }
}

// Cached API Client Wrapper
public class CachedAPIClient: APIClientProtocol {
    private let client: APIClientProtocol
    private let cache: APICacheProtocol
    
    public init(client: APIClientProtocol, cache: APICacheProtocol = InMemoryAPICache()) {
        self.client = client
        self.cache = cache
    }
    
    public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> (data: T, requestId: String) {
        // Only cache GET requests
        guard endpoint.method == .get else {
            return try await client.request(endpoint)
        }
        
        let cacheKey = endpoint.cacheKey
        
        // Check cache
        if let cached: T = cache.get(for: cacheKey) {
            return (data: cached, requestId: "cached")
        }
        
        // Make request
        let (data, requestId) = try await client.request(endpoint)
        
        // Cache response (5 minute TTL)
        cache.set(data, for: cacheKey, ttl: 300)
        
        return (data: data, requestId: requestId)
    }
    
    public func invalidateCache() {
        cache.clear()
    }
}
```

## Step 7: Add API Logger

### Location
`Packages/core-networking/Sources/CoreNetworking/Logging/APILogger.swift`

### Implementation

```swift
import Foundation
import os.log

public protocol APILogger {
    func logRequest(_ request: URLRequest, endpoint: APIEndpoint)
    func logResponse(_ response: HTTPURLResponse, requestId: String, endpoint: APIEndpoint, duration: TimeInterval)
    func logError(_ error: APIError, endpoint: APIEndpoint, duration: TimeInterval)
}

public class DefaultAPILogger: APILogger {
    private let logger = Logger(subsystem: "com.scorebase.api", category: "networking")
    
    public init() {}
    
    public func logRequest(_ request: URLRequest, endpoint: APIEndpoint) {
        #if DEBUG
        logger.info("🌐 \\(request.httpMethod ?? "GET") \\(endpoint.path)")
        #endif
    }
    
    public func logResponse(_ response: HTTPURLResponse, requestId: String, endpoint: APIEndpoint, duration: TimeInterval) {
        #if DEBUG
        logger.info("✅ \\(response.statusCode) \\(endpoint.path) [\\(String(format: "%.2f", duration * 1000))ms] Request ID: \\(requestId)")
        #endif
    }
    
    public func logError(_ error: APIError, endpoint: APIEndpoint, duration: TimeInterval) {
        let requestId = error.requestId ?? "unknown"
        logger.error("❌ \\(endpoint.path) [\\(String(format: "%.2f", duration * 1000))ms] Error: \\(error.localizedDescription) Request ID: \\(requestId)")
    }
}
```

## Step 8: Update Endpoint Definitions

### Location
`Packages/core-networking/Sources/CoreNetworking/Endpoints/`

### Example Endpoints

```swift
// Packages/core-networking/Sources/CoreNetworking/Endpoints/LeagueEndpoints.swift

import Foundation

public struct GetLeaguesEndpoint: APIEndpoint {
    public var path: String { "/leagues" }
    public var method: HTTPMethod { .get }
    public var body: Encodable? { nil }
    public var queryParameters: [String: String]? { nil }
    
    public var cacheKey: String {
        "leagues"
    }
    
    public init() {}
}

public struct GetLeagueByIdEndpoint: APIEndpoint {
    public let leagueId: String
    
    public var path: String { "/leagues/\\(leagueId)" }
    public var method: HTTPMethod { .get }
    public var body: Encodable? { nil }
    public var queryParameters: [String: String]? { nil }
    
    public var cacheKey: String {
        "league_\\(leagueId)"
    }
    
    public init(leagueId: String) {
        self.leagueId = leagueId
    }
}
```

## Testing the Integration

### Unit Test Example

```swift
import XCTest
@testable import CoreNetworking

class APIClientIntegrationTests: XCTestCase {
    var apiClient: ScoreBaseAPIClient!
    var mockAuthManager: MockAuthenticationManager!
    
    override func setUp() {
        super.setUp()
        
        let config = APIConfiguration(environment: .staging)
        mockAuthManager = MockAuthenticationManager()
        apiClient = ScoreBaseAPIClient(
            configuration: config,
            authManager: mockAuthManager
        )
    }
    
    func testFetchLeagues() async throws {
        // Make request
        let (leagues, requestId): ([League], String) = try await apiClient.request(GetLeaguesEndpoint())
        
        // Verify
        XCTAssertFalse(leagues.isEmpty)
        XCTAssertFalse(requestId.isEmpty)
        XCTAssertNotEqual(requestId, "cached")
    }
}
```

## Deployment Checklist

- [ ] Update base URL configuration
- [ ] Implement Cognito authentication
- [ ] Update all DTOs to match backend format
- [ ] Add request_id tracking
- [ ] Implement error mapping
- [ ] Update caching strategy
- [ ] Add API logging
- [ ] Update all endpoint definitions
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Test with staging environment
- [ ] Update documentation

## Additional Resources

- [iOS Integration Guide](./ios-integration-guide.md)
- [OpenAPI Specification](./openapi.yaml)
- [Backend API Documentation](./API_DOCUMENTATION.md)
