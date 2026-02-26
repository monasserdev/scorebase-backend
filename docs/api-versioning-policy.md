# ScoreBase API Versioning and Deprecation Policy

## Overview

This document defines the versioning strategy, deprecation policy, and change management process for the ScoreBase Backend API. It ensures predictable API evolution while maintaining backward compatibility for existing consumers.

## Versioning Strategy

### URL Path Versioning

The ScoreBase API uses URL path versioning with the version number in the path:

```
https://api.scorebase.com/v1/leagues
https://api.scorebase.com/v2/leagues
```

**Rationale:**
- Clear and explicit version in every request
- Easy to route different versions to different implementations
- Simple for clients to understand and use
- Supports running multiple versions simultaneously

### Version Format

- **Format**: `/v{major}/`
- **Examples**: `/v1/`, `/v2/`, `/v3/`
- **Current Version**: `v1`

### Version Lifecycle

Each API version goes through the following lifecycle:

1. **Beta** (optional): `/v2-beta/` - Early access for testing
2. **Current**: `/v2/` - Fully supported, recommended for new integrations
3. **Deprecated**: `/v1/` - Still functional but scheduled for removal
4. **Sunset**: Version removed, returns 410 Gone

## Breaking vs Non-Breaking Changes

### Non-Breaking Changes (Allowed in Current Version)

These changes can be made to the current version without incrementing the major version:

✅ **Adding new endpoints**
```
# Before
GET /v1/leagues

# After (non-breaking)
GET /v1/leagues
GET /v1/leagues/{leagueId}/divisions  # New endpoint
```

✅ **Adding optional request parameters**
```
# Before
GET /v1/games?status=live

# After (non-breaking)
GET /v1/games?status=live&date=2024-01-15  # New optional parameter
```

✅ **Adding new fields to responses**
```json
// Before
{
  "league_id": "123",
  "name": "Test League"
}

// After (non-breaking)
{
  "league_id": "123",
  "name": "Test League",
  "description": "New optional field"  // New field
}
```

✅ **Adding new enum values**
```typescript
// Before
type SportType = "basketball" | "soccer"

// After (non-breaking)
type SportType = "basketball" | "soccer" | "hockey"  // New value
```

✅ **Adding new error codes**
```
# New error codes can be added without breaking existing clients
```

✅ **Performance improvements**
```
# Faster response times, better caching, etc.
```

### Breaking Changes (Require New Version)

These changes require incrementing the major version:

❌ **Removing endpoints**
```
# Requires v2
DELETE /v1/leagues/{leagueId}/divisions
```

❌ **Removing request parameters**
```
# Requires v2
GET /v1/games?status=live  # Removing 'status' parameter
```

❌ **Removing response fields**
```json
// Requires v2
{
  "league_id": "123"
  // "name" field removed
}
```

❌ **Changing field types**
```json
// v1
{
  "score": 42  // number
}

// v2 (breaking)
{
  "score": "42"  // string
}
```

❌ **Renaming fields**
```json
// v1
{
  "league_id": "123"
}

// v2 (breaking)
{
  "id": "123"  // Renamed field
}
```

❌ **Changing enum values**
```typescript
// v1
type Status = "active" | "inactive"

// v2 (breaking)
type Status = "enabled" | "disabled"  // Changed values
```

❌ **Changing authentication requirements**
```
# v1: JWT token required
# v2: OAuth 2.0 required (breaking)
```

❌ **Changing error response format**
```json
// v1
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}

// v2 (breaking)
{
  "errors": [  // Changed structure
    {
      "type": "NOT_FOUND",
      "detail": "Resource not found"
    }
  ]
}
```

## Deprecation Policy

### Deprecation Timeline

When a breaking change is needed:

1. **Announcement** (T+0): Deprecation announced via multiple channels
2. **Deprecation Period** (T+0 to T+6 months): Old version marked deprecated but fully functional
3. **Sunset Warning** (T+5 months): Final warning before sunset
4. **Sunset** (T+6 months): Old version removed

**Minimum Deprecation Period**: 6 months

### Deprecation Process

#### 1. Announcement (T+0)

Deprecation is announced through:
- Email to all registered API consumers
- Slack channel (#api-announcements)
- API documentation website
- GitHub release notes
- In-app notifications (for iOS team)

**Announcement Template:**
```
Subject: API v1 Deprecation Notice - Action Required

Dear ScoreBase API Consumer,

We are announcing the deprecation of API v1, effective [DATE].

What's Changing:
- [List of breaking changes]

Migration Path:
- [Link to migration guide]
- [Code examples]

Timeline:
- Today: v2 available for testing
- [DATE + 6 months]: v1 will be sunset

Action Required:
- Review migration guide
- Test your integration with v2
- Update your app before [DATE + 6 months]

Support:
- Email: api-support@scorebase.com
- Slack: #api-support
```

#### 2. Deprecation Headers (T+0 to T+6 months)

Deprecated endpoints return deprecation headers:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 31 Dec 2024 23:59:59 GMT
Link: <https://api.scorebase.com/v2/leagues>; rel="successor-version"
```

#### 3. Response Warnings (T+3 months)

After 3 months, responses include warning messages:

```json
{
  "request_id": "...",
  "timestamp": "...",
  "data": [...],
  "_warnings": [
    {
      "code": "DEPRECATED_VERSION",
      "message": "API v1 is deprecated and will be sunset on 2024-12-31. Please migrate to v2.",
      "migration_guide": "https://docs.scorebase.com/api/migration/v1-to-v2"
    }
  ]
}
```

#### 4. Sunset (T+6 months)

After 6 months, deprecated endpoints return:

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "error": {
    "code": "VERSION_SUNSET",
    "message": "API v1 has been sunset. Please use v2.",
    "sunset_date": "2024-12-31",
    "migration_guide": "https://docs.scorebase.com/api/migration/v1-to-v2",
    "request_id": "..."
  }
}
```

## Version Support Policy

### Supported Versions

- **Current Version**: Fully supported, receives all updates
- **Previous Version**: Supported for 6 months after new version release
- **Older Versions**: Not supported, may be sunset

### Support Levels

| Version | Status | Bug Fixes | New Features | Security Patches |
|---------|--------|-----------|--------------|------------------|
| v2 (Current) | ✅ Supported | ✅ Yes | ✅ Yes | ✅ Yes |
| v1 (Deprecated) | ⚠️ Limited | ✅ Critical Only | ❌ No | ✅ Yes |
| v0 (Sunset) | ❌ Not Supported | ❌ No | ❌ No | ❌ No |

## Migration Process

### Migration Guide Template

Each version migration includes a comprehensive guide:

```markdown
# Migration Guide: v1 to v2

## Overview
- Release Date: 2024-01-15
- Deprecation Date: 2024-01-15
- Sunset Date: 2024-07-15

## Breaking Changes

### 1. League Response Format
**Change**: Added required `divisions` field

**v1 Response:**
```json
{
  "league_id": "123",
  "name": "Test League"
}
```

**v2 Response:**
```json
{
  "league_id": "123",
  "name": "Test League",
  "divisions": []
}
```

**Migration Steps:**
1. Update DTO to include `divisions` field
2. Handle empty array case
3. Test with staging environment

### 2. Authentication Changes
[Details...]

## Testing Checklist
- [ ] Update base URL to /v2/
- [ ] Update DTOs
- [ ] Run integration tests
- [ ] Test error handling
- [ ] Verify backward compatibility

## Support
- Email: api-support@scorebase.com
- Slack: #api-migration
```

### Migration Support

During migration period:
- Dedicated Slack channel (#api-migration)
- Office hours for migration questions
- Sample code and examples
- Staging environment for testing
- Migration validation tools

## Communication Channels

### For API Changes

1. **Email Notifications**
   - Sent to all registered API consumers
   - Includes change details and timeline
   - Links to migration guides

2. **Slack Channels**
   - #api-announcements: Major announcements
   - #api-support: Questions and support
   - #api-migration: Migration assistance

3. **Documentation Website**
   - Changelog page
   - Migration guides
   - Version comparison

4. **GitHub**
   - Release notes
   - Tagged releases
   - Migration examples

5. **In-App Notifications**
   - iOS app notifications
   - Dashboard alerts
   - Email digests

### Notification Schedule

- **Major Version**: 6 months advance notice
- **Deprecation**: Immediate notification
- **Breaking Changes**: 6 months advance notice
- **Non-Breaking Changes**: Included in monthly changelog
- **Security Updates**: Immediate notification

## Backward Compatibility Guarantees

### Within Major Version

Within a major version (e.g., v1.x):
- ✅ No breaking changes
- ✅ Existing integrations continue to work
- ✅ New features are additive only
- ✅ Bug fixes don't change behavior

### Across Major Versions

Across major versions (e.g., v1 → v2):
- ⚠️ Breaking changes allowed
- ⚠️ 6-month migration period provided
- ✅ Migration guide provided
- ✅ Both versions run simultaneously

### Exception: Security Issues

Security vulnerabilities may require immediate breaking changes:
- Notification sent immediately
- 30-day grace period (instead of 6 months)
- Emergency migration support provided
- Detailed security advisory published

## Version Discovery

### API Version Endpoint

```http
GET /versions

Response:
{
  "current": "v2",
  "supported": ["v1", "v2"],
  "deprecated": ["v1"],
  "sunset_dates": {
    "v1": "2024-12-31"
  },
  "latest_changes": {
    "v2": "https://docs.scorebase.com/api/changelog/v2"
  }
}
```

### Version Headers

All responses include version information:

```http
API-Version: v1
API-Current-Version: v2
API-Deprecated: true
API-Sunset-Date: 2024-12-31
```

## Best Practices for Consumers

### 1. Always Specify Version

```swift
// ✅ Good
let baseURL = "https://api.scorebase.com/v1"

// ❌ Bad
let baseURL = "https://api.scorebase.com"  // No version
```

### 2. Handle New Fields Gracefully

```swift
// ✅ Good - Ignore unknown fields
struct League: Codable {
    let id: String
    let name: String
    // New fields added automatically
}

// ❌ Bad - Strict parsing
// Fails when new fields are added
```

### 3. Monitor Deprecation Headers

```swift
if let deprecation = response.headers["Deprecation"] {
    logger.warning("API version deprecated: \\(deprecation)")
    // Alert team to migrate
}
```

### 4. Test Against Multiple Versions

```swift
// Test against current and next version
let v1Client = APIClient(version: "v1")
let v2Client = APIClient(version: "v2")
```

### 5. Subscribe to Notifications

- Register email for API updates
- Join Slack channels
- Watch GitHub repository
- Enable in-app notifications

## Frequently Asked Questions

### Q: How long are API versions supported?

A: Each version is supported for at least 6 months after the next version is released.

### Q: Can I use multiple versions simultaneously?

A: Yes, you can use different versions for different parts of your app during migration.

### Q: What happens if I don't migrate before sunset?

A: Your requests will return 410 Gone errors. You must migrate to continue using the API.

### Q: Are there any exceptions to the 6-month policy?

A: Yes, critical security vulnerabilities may require faster deprecation (30 days).

### Q: How do I know which version I'm using?

A: Check the URL path (/v1/, /v2/) or the API-Version response header.

### Q: Can I request an extension to the deprecation timeline?

A: Contact api-support@scorebase.com to discuss your specific situation.

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [OpenAPI Specification](./openapi.yaml)
- [iOS Integration Guide](./ios-integration-guide.md)
- [Migration Guides](https://docs.scorebase.com/api/migrations)
- [Changelog](https://docs.scorebase.com/api/changelog)

---

**Document Version:** 1.0.0  
**Last Updated:** January 2024  
**Author:** ScoreBase Engineering Team  
**Contact:** api-support@scorebase.com
