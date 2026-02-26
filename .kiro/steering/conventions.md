# Engineering Conventions and Best Practices

## Core Principles

1. Modular first, monolith never
2. UI is declarative and stateless where possible
3. Business logic lives outside Views
4. Dependency injection over singletons
5. Protocol-oriented architecture
6. Design tokens are the single source of visual truth
7. No feature-to-feature dependencies
8. Concurrency must be safe and explicit

## SwiftUI View Guidelines

Views must:
- Be lightweight and declarative
- Avoid business logic
- Avoid direct network calls
- Use ViewModels for state and logic
- Avoid force unwraps
- Keep files under 300 lines

If a View grows too large:
- Extract subviews
- Extract modifiers
- Move reusable components to ui-core-components

## State Management (MVVM)

**Views:**
- Own only presentation state
- Observe ViewModel via @StateObject or @ObservedObject
- Never perform business logic in body

**ViewModels:**
- Mark UI-bound properties with @Published
- Run async work inside Task
- Update UI only on MainActor
- Keep files under 400 lines

**Forbidden:**
- Global mutable state
- Static mutable variables
- Singletons for shared services

## Concurrency Rules

- Use async/await exclusively
- Avoid callback-based networking
- Always mark ViewModel async entry points with @MainActor if they update UI
- Never perform blocking work on the main thread
- Use Task cancellation when appropriate

Example:
```swift
@MainActor
class GameViewModel: ObservableObject {
    @Published var games: [Game] = []
    @Published var isLoading = false
    @Published var error: Error?
    
    func loadGames() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            games = try await apiClient.fetchGames()
        } catch {
            self.error = error
        }
    }
}
```

## Dependency Injection

All external dependencies must be injected via protocols.

**Example:**
```swift
protocol APIClientProtocol {
    func fetchStandings() async throws -> [TeamStanding]
}

class StandingsViewModel: ObservableObject {
    private let apiClient: APIClientProtocol
    
    init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }
}
```

**Production:** RealAPIClient
**Testing:** MockAPIClient

**Rules:**
- No direct instantiation of networking clients inside ViewModels
- No singleton usage for shared services
- App-level container provides dependency graph

## Design System Enforcement

**Forbidden:**
- Hardcoded colors: `Color(red: 0.1, green: 0.2, blue: 0.3)`
- Hardcoded fonts: `.font(.system(size: 16))`
- Hardcoded spacing: `.padding(12)`
- Inline hex colors: `Color(#colorLiteral(...))`

**Required:**
- Colors from ui-design-tokens: `DesignTokens.Colors.primaryNavy`
- Typography from tokens: `DesignTokens.Typography.body`
- Spacing from tokens: `DesignTokens.Spacing.standardHorizontal`
- Radius from tokens: `DesignTokens.Radius.card`

## Performance Guidelines

- Use LazyVStack/LazyHStack for long lists
- Avoid unnecessary re-renders
- Use Equatable where appropriate
- Avoid heavy computation inside Views
- Pre-compute sorted or filtered lists in ViewModel
- Target: 60fps scrolling on modern devices

## Error Handling

- All async functions must throw meaningful errors
- ViewModels must expose error state via @Published property
- UI must present retry options
- Never silently swallow errors
- Log unexpected failures

**Example:**
```swift
enum NetworkError: Error {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case decodingError(Error)
}
```

## Code Style

- Prefer small, focused types
- Use explicit access control (public/internal/private)
- Avoid deeply nested conditionals
- Favor early returns
- Use clear naming over clever naming
- No unexplained magic numbers
- Extract constants to meaningful names

**File size guidelines:**
- ViewModels: < 400 lines
- Views: < 300 lines
- Extract when exceeded

## Accessibility Requirements

- All interactive elements must have accessibility labels
- Maintain 44x44pt minimum touch targets
- Support Dynamic Type
- Maintain sufficient color contrast (WCAG AA minimum)
- Avoid conveying information by color alone
- Test with VoiceOver enabled

## Navigation Standards

- Use centralized navigation coordinator pattern
- Avoid ad-hoc NavigationLink chains across modules
- Preserve state when navigating back
- Keep routing logic outside of Views
- Feature modules handle their own internal navigation

## Testing Requirements

All packages must include tests:

**Minimum expectations:**
- ViewModel logic tested (state transitions, error handling)
- Model validation tested (business rules)
- Networking decoding tested (JSON parsing)
- Snapshot tests for core UI components (light/dark mode)

**Testing tools:**
- Swift Testing framework for unit tests
- XCUITest for UI automation
- swift-snapshot-testing for visual regression

**No package may ship without tests.**

## Anti-Patterns (Forbidden)

- Massive View files (>300 lines)
- Networking inside Views
- Business logic inside SwiftUI body
- Hardcoded styling values
- Singletons for shared services
- Cross-feature imports
- Global mutable state
- Callback-based async networking
- Force unwrapping optionals without clear justification
- Direct database/API access from Views

## Definition of Done

A feature is complete when:

- Modular boundaries respected (no forbidden dependencies)
- ViewModel covered by tests
- No hardcoded design values
- Accessibility validated
- Dark mode verified
- Performance tested (60fps scrolling)
- Code reviewed
- Documentation comments added for public APIs

## Backend Integration Standards

When integrating with the ScoreBase backend:

**API Contract:**
- All endpoints are RESTful and versioned (e.g., `/v1/leagues`)
- Responses include `request_id` and `timestamp`
- Use camelCase for JSON field names
- Handle pagination metadata when present

**Authentication:**
- JWT tokens from Amazon Cognito
- Include Authorization header in all authenticated requests
- Handle token refresh gracefully

**Multi-Tenant:**
- Backend enforces tenant_id scoping
- Never assume cross-tenant data access
- Respect tenant isolation in UI

**Event-Driven:**
- Backend uses immutable event history
- Game actions produce events (GOAL_SCORED, GAME_FINALIZED, etc.)
- UI should reflect event-driven nature (optimistic updates, event timeline)

**Error Handling:**
- Backend returns structured errors with `code` and `message`
- Map backend error codes to user-friendly messages
- Include `request_id` in error logs for debugging

## Long-Term Evolution

As ScoreBase scales:

- Enforce linting rules (SwiftLint)
- Introduce static analysis for design token enforcement
- Introduce architecture validation scripts
- Automate dependency graph checks
- Introduce visual regression CI pipeline
- Add performance monitoring and metrics
