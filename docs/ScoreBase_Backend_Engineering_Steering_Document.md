# ScoreBase Backend Engineering Steering Document
Generated: 2026-02-25T01:24:52.039315 UTC

---

# 1. Purpose

This document defines the architectural guardrails and backend engineering standards
for the ScoreBase platform.

It ensures:

- Backend consistency
- Event-driven integrity
- Multi-tenant isolation
- Alignment with iOS frontend architecture
- Long-term scalability

This document must align with:
- Global/Regional AWS Architecture SDD
- Canonical Event Schema
- iOS Modular Architecture
- Frontend Engineering Steering Document

---

# 2. Core Backend Principles

1. Event-driven from Day 1.
2. Operational data and event data are separated.
3. Multi-tenant isolation is enforced at every layer.
4. APIs are contract-first and versioned.
5. Backend is sport-agnostic.
6. No business logic in controllers.
7. All mutations produce events.
8. Data consistency > premature optimization.

---

# 3. High-Level Architecture (Lean <20 Leagues Deployment)

API Gateway
→ Lambda (Modular Monolith)
→ RDS (Operational Data)
→ DynamoDB (Event Store)
→ S3 (Event Archive)

Authentication:
Amazon Cognito (JWT-based)

---

# 4. Domain Separation

Backend must enforce clear separation between:

- Tenant
- League
- Season
- Division
- Team
- Game
- Player

No cross-tenant queries allowed without explicit authorization.

---

# 5. Canonical Event Model Enforcement

All game actions must produce immutable events.

Example event types:

- GAME_STARTED
- GOAL_SCORED
- PENALTY_ASSESSED
- PERIOD_ENDED
- GAME_FINALIZED

Rules:

- Events are immutable.
- No destructive updates.
- Corrections produce compensating events.
- Each event must include:
  - event_id (UUID)
  - game_id
  - occurred_at (ISO 8601)
  - event_version
  - tenant_id

---

# 6. API Design Standards

## 6.1 REST Principles

- All endpoints must be RESTful.
- Use nouns, not verbs.
- Use plural resource names.
- No RPC-style endpoints.

Example:

GET /leagues
GET /seasons/{seasonId}
GET /games/{gameId}
POST /games/{gameId}/events

---

## 6.2 Versioning

All APIs must be versioned.

Example:

/v1/leagues
/v1/games

Breaking changes require new version path.

---

## 6.3 Response Standards

All responses must:

- Return consistent envelope format
- Include request_id
- Include timestamp
- Include pagination metadata (if applicable)

Example response structure:

{
  "request_id": "uuid",
  "timestamp": "ISO-8601",
  "data": { ... },
  "meta": { ... }
}

---

# 7. Data Integrity Rules

## 7.1 RDS (Operational)

- Standings must be recalculated upon game finalization.
- Games marked FINAL must have valid scores.
- No duplicate teams in standings table.
- Foreign key constraints enforced.
- Use migrations for schema evolution.

## 7.2 DynamoDB (Event Store)

- Partition key: game_id
- Sort key: occurred_at#event_id
- On-demand capacity for lean deployment.
- Events never updated in place.

---

# 8. Multi-Tenant Enforcement

Each request must:

- Validate JWT.
- Extract tenant_id from claims.
- Enforce tenant-level data scoping.

No endpoint may return cross-tenant data.

---

# 9. Backend ↔ Frontend Contract Alignment

The backend must:

- Provide stable DTOs.
- Avoid leaking database schema directly.
- Map internal models to API response models.
- Maintain field naming consistency (camelCase for JSON).
- Avoid breaking changes without version bump.

Frontend must:

- Not assume undocumented fields.
- Not rely on implicit sorting behavior.
- Handle missing optional fields gracefully.

---

# 10. Error Handling Standards

All errors must:

- Return proper HTTP status codes.
- Include structured error object.
- Avoid leaking internal stack traces.

Example:

{
  "error": {
    "code": "GAME_NOT_FOUND",
    "message": "The requested game does not exist.",
    "request_id": "uuid"
  }
}

---

# 11. Observability & Logging

Each request must log:

- request_id
- tenant_id
- user_id (if authenticated)
- latency
- status code

Event mutations must log event_id and game_id.

Future expansion:
- CloudWatch metrics
- Alarm thresholds
- Structured JSON logging

---

# 12. Performance Targets

Lean Deployment Targets:

- Typical API latency < 200ms
- Standings recalculation < 100ms
- Event write < 50ms
- DynamoDB read consistency eventually consistent unless strict required

---

# 13. Migration & Versioning Strategy

- All RDS schema changes via migration scripts.
- No manual DB changes in production.
- Event schema changes must increment event_version.
- Backward compatibility must be maintained for at least one major version.

---

# 14. Security Requirements

- HTTPS only.
- JWT validation mandatory.
- IAM least privilege roles.
- No secrets in source control.
- Environment variables for configuration.
- RDS encryption enabled.
- S3 buckets private by default.

---

# 15. Testing Requirements (Backend)

Backend must include:

- Unit tests for domain logic.
- Event schema validation tests.
- API contract tests.
- Standings ranking logic tests.
- Multi-tenant isolation tests.

---

# 16. Definition of Done (Backend)

A backend feature is complete when:

- Event emission implemented.
- RDS changes migrated.
- API contract documented.
- Multi-tenant enforcement validated.
- Unit tests written.
- Performance verified.
- Logging implemented.

---

# 17. Anti-Patterns (Forbidden)

- Direct DB access from controllers.
- Cross-tenant joins.
- Hardcoded tenant IDs.
- Mutable event history.
- Breaking API contracts silently.
- Business logic inside request routing layer.
- Manual production DB edits.

---

# 18. Future Evolution

As ScoreBase scales:

- Introduce Kinesis for streaming.
- Introduce analytics warehouse.
- Introduce DynamoDB Global Tables.
- Separate analytics account.
- Add multi-region failover.

---

# 19. Summary

ScoreBase backend governance ensures:

- Event-driven integrity
- Multi-tenant isolation
- Contract stability
- Scalable AWS architecture
- Alignment with modular iOS frontend

This steering document protects the long-term architectural integrity
of the ScoreBase platform.

---

END OF DOCUMENT
