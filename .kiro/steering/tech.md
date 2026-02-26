# Technology Stack

## Platform

- iOS 17+
- Swift 5.9+
- SwiftUI (declarative UI framework)
- Swift Package Manager (SPM) for modularization

## Architecture Style

- Modular package-based architecture
- Feature-driven modularization with clear dependency boundaries
- MVVM pattern (Model-View-ViewModel)
- Async/await for concurrency
- Protocol-oriented design for testability

## Core Technologies

- Swift Testing framework (Xcode 15+) for unit tests
- XCUITest for UI automation tests
- pointfreeco/swift-snapshot-testing for visual regression testing
- URLSession for networking
- Codable for JSON serialization
- Combine/SwiftUI @Published for reactive state management

## Package Structure

The codebase is organized into independent Swift packages:

### UI Layer
- `ui-design-tokens`: Colors, typography, spacing, radius (zero dependencies)
- `ui-core-components`: Primitive reusable components (depends on ui-design-tokens)
- `ui-sports-components`: Sport-specific composite views (depends on ui-core-components)

### Feature Layer
- `feature-home`: Home screen and league overview
- `feature-schedule`: Game schedule with date filtering
- `feature-standings`: Team rankings and records
- `feature-teams`: Team details and rosters
- `feature-stats`: Player statistics and leaderboards

### Core Layer
- `core-models`: Shared domain models (League, Team, Game, Player, etc.)
- `core-networking`: API client and networking layer

## Dependency Rules

- Feature modules NEVER depend on other feature modules
- Feature modules depend on ui-sports-components and core-models
- UI components depend only on lower-level UI packages
- core-networking depends on core-models
- All dependencies form a directed acyclic graph (no circular dependencies)

## Design System

- Brand colors: Primary Navy (#0B2545), Accent Gold (#FCCA46)
- Typography: SF Pro Display with defined scale
- Spacing: 4pt base grid (8pt, 12pt, 16pt, 24pt, 32pt)
- Corner radius: Cards (16pt), Buttons (12pt), Badges (8pt)
- Full light/dark mode support

## Common Commands

### Build
```bash
# Build all packages
swift build

# Build specific package
cd Packages/core-models && swift build
```

### Test
```bash
# Run all tests
swift test

# Run tests for specific package
cd Packages/core-models && swift test

# Run with coverage
swift test --enable-code-coverage
```

### Package Management
```bash
# Update dependencies
swift package update

# Resolve dependencies
swift package resolve

# Generate Xcode project (if needed)
swift package generate-xcodeproj
```

## Code Quality Standards

- Minimum 80% code coverage for core-models and ViewModels
- All public APIs must have documentation comments
- Use dependency injection for testability (protocol-oriented design)
- All ViewModels must be @MainActor
- No hardcoded design values outside ui-design-tokens
- Sport-agnostic component design (no hardcoded sport terminology)
- Use async/await exclusively (no callback-based networking)
- All packages must include tests before shipping

## API Integration

- Backend uses RESTful API with versioned endpoints (e.g., `/v1/leagues`)
- All responses include request_id and timestamp
- Authentication via Amazon Cognito JWT tokens
- Multi-tenant architecture with tenant_id scoping
- Event-driven backend with immutable event history
- Typical API latency target: < 200ms
