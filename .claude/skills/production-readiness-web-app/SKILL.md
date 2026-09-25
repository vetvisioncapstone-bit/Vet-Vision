---
name: production-readiness-web-app
description: Analyze a web application, backend, database, and deployment setup for production-readiness using ten core engineering practices: rollback planning, validation and sanitization, frontend error handling, database indexing, structured logging, password-reset expiration, CORS configuration, authorization, monitoring alarms, and rate limiting. Use this skill to inspect project code, architecture, configuration, APIs, database access, authentication flows, and deployment practices; identify concrete risks; explain why they matter; and provide prioritized, implementation-ready fixes without unnecessarily changing working functionality.
---

# Production Readiness & Reliability Audit Skill

## Purpose

Use this skill when a user asks to:
- audit a website or web application before publishing/deployment
- optimize a web app for production
- check whether a project is secure, reliable, and scalable
- review frontend, backend, database, authentication, deployment, or monitoring practices
- generate a production-readiness checklist
- inspect a codebase and recommend fixes based on common production engineering practices

The skill is based on ten core practices:

1. Rollback plan
2. Validation and sanitization
3. Frontend error handling
4. Database indexes
5. Logging
6. Password reset expiration
7. CORS
8. Authorization
9. Alarms/monitoring
10. Rate limiting

Do not treat these as isolated features. Check how they work together across the whole application.

---

# 1. Rollback Plan

## Core principle

The fastest fix for a bad deployment is often returning to a known-good state.

Before deployment, verify that the application can be reverted safely.

## Check for

- Previous application version remains deployable.
- Releases/builds are versioned or tagged.
- Deployment process has a documented rollback procedure.
- Configuration changes can be reverted.
- Database migrations are backward-compatible when possible.
- Risky features can be disabled using feature flags.
- A failed deployment does not require emergency manual code reconstruction.
- Backups exist when destructive database changes are involved.
- Rollback responsibilities and steps are understood by the team.

## Expected flow

1. Detect the issue.
2. Trigger or perform rollback.
3. Restore the known-good application state.
4. Verify health and critical functionality.
5. Confirm users are no longer affected.

## Important warning

Application rollback alone may not be safe if the new version changed the database schema incompatibly. Always consider code, configuration, and database state together.

---

# 2. Validation and Sanitization

## Core principle

Never trust user input.

Incoming data should be validated before it reaches application logic, database queries, or HTML rendering.

## Check for

- Request body validation.
- Query parameter validation.
- Path parameter validation.
- Correct data types.
- Required fields.
- Length limits.
- Allowed-value/enumeration checks.
- File upload validation when applicable.
- Server-side validation, not only frontend validation.
- Output encoding/sanitization when content is rendered as HTML.
- Parameterized queries or safe ORM/database APIs.
- Protection against SQL injection.
- Protection against XSS.

## Recommended flow

Client input
→ API boundary validation
→ application logic
→ safe database operation
→ encoded/sanitized output

## Important distinction

Validation checks whether data has the expected shape and values.

Sanitization/encoding reduces the risk of dangerous content being interpreted as code or markup.

Do not rely on sanitization as a replacement for parameterized database queries.

---

# 3. Frontend Error Handling

## Core principle

Users should see useful recovery states instead of raw crashes, blank screens, stack traces, or confusing errors.

## Check for

- Global/component error boundaries where appropriate.
- API failure states.
- Loading states.
- Empty states.
- Retry actions.
- Refresh/reload recovery.
- Friendly error messages.
- Form validation feedback.
- Network failure handling.
- Authentication/session-expiration handling.
- Safe handling of unexpected component errors.
- Internal error details hidden from normal users.

## Good user-facing pattern

Instead of:

"TypeError: Cannot read properties of undefined..."

Show:

"Something went wrong while loading this page. Please try again."

Then provide a useful action such as:
- Retry
- Refresh
- Go back
- Return home
- Contact support

## React-specific check

If the project uses React, inspect whether error boundaries are used for component-level failures where appropriate.

---

# 4. Database Indexes

## Core principle

Indexes should support the queries the application actually runs frequently.

## Check for

- Frequently filtered columns.
- Frequently sorted columns.
- Frequently joined columns.
- Foreign-key access patterns.
- Search patterns that justify indexes.
- Composite indexes for common multi-column queries.
- Query performance using the database's query-plan tools when available.
- Duplicate or unnecessary indexes.

## Avoid

Do not automatically index every column.

Indexes improve reads but add storage and can make inserts/updates/deletes more expensive.

## Audit method

1. Identify frequent application queries.
2. Identify WHERE conditions.
3. Identify JOIN conditions.
4. Identify ORDER BY patterns.
5. Check existing indexes.
6. Compare query plans/performance.
7. Add only indexes that support meaningful access patterns.

---

# 5. Logging

## Core principle

When production breaks, logs may be the fastest way to determine what happened.

## Check for

- Structured logs.
- Consistent log levels.
- Useful request context.
- Error details for developers.
- Request IDs/correlation IDs when appropriate.
- Timestamped events.
- Relevant user/session/request context without exposing sensitive data.
- Server-side logging of important failures.
- Centralized log collection when appropriate.

## Never log

- Passwords.
- Authentication tokens.
- API keys.
- Secrets.
- Full payment credentials.
- Sensitive personal data unless there is a justified and controlled reason.

## Avoid

- Excessive debug noise in production.
- Logging everything without purpose.
- Logs that lack enough context to reproduce or trace an issue.

## Good structured-log fields may include

- timestamp
- level
- event
- request ID
- endpoint
- HTTP method
- status code
- duration
- service/component
- safe error information

---

# 6. Password Reset Expiration

## Core principle

A password-reset link should be short-lived and single-use.

An old reset email should not remain capable of taking over an account.

## Check for

- Short expiration period, commonly around 15–30 minutes depending on the application.
- Cryptographically secure reset tokens.
- Tokens stored safely.
- Single-use behavior.
- Token invalidation after successful reset.
- Previous reset tokens invalidated when a new reset request is issued, when appropriate.
- Generic responses that do not unnecessarily reveal whether an account exists.
- HTTPS for reset links.
- No passwords embedded in URLs.

## Expected lifecycle

Reset requested
→ secure token generated
→ reset email sent
→ token expires after a short period
→ token is consumed after successful reset
→ token cannot be reused

---

# 7. CORS

## Core principle

If a frontend communicates with a backend from another origin, explicitly control which origins are allowed.

## Check for

- Allowed frontend origins.
- Allowed HTTP methods.
- Allowed headers.
- Credential configuration.
- Preflight handling.
- Environment-specific CORS configuration.
- Production configuration is not unnecessarily permissive.

## Avoid

Do not use:

Access-Control-Allow-Origin: *

when the API does not need to be publicly accessible from every origin.

Especially review wildcard CORS together with credentialed requests.

## Important distinction

CORS is not an authentication or authorization mechanism.

It is primarily a browser-enforced cross-origin access control mechanism.

The backend must still authenticate and authorize every protected request.

---

# 8. Authorization

## Core principle

Never trust the frontend to enforce permissions.

Authentication answers:

"Who are you?"

Authorization answers:

"What are you allowed to access or do?"

## Check for

- Server-side authorization checks.
- Role/permission checks.
- Resource ownership checks.
- Access checks on every protected endpoint.
- Protection against changing IDs in URLs or request bodies.
- Protection against horizontal privilege escalation.
- Protection against vertical privilege escalation.
- Database-level security where appropriate.
- Row-level security (RLS) where the database supports and the architecture benefits from it.
- Hidden frontend buttons are treated only as UX, never as security.

## Example

A request such as:

GET /users/123/orders

must not automatically be allowed simply because the requester changed their URL from:

/users/122/orders

The server must verify that the authenticated user has permission to access user 123's records.

---

# 9. Alarms and Monitoring

## Core principle

Monitoring should tell the team when important behavior is going wrong, preferably before customers report it.

## Check for

- Error-rate monitoring.
- HTTP 5xx monitoring.
- Latency monitoring.
- Authentication failure monitoring.
- Payment failure monitoring if applicable.
- Signup/login failure monitoring.
- Resource utilization monitoring.
- Database health monitoring.
- Availability/uptime monitoring.
- Threshold-based alerts.
- Alert routing to a monitored destination.

## Useful alert examples

- Sudden 5xx spike.
- Latency exceeds an agreed threshold.
- Database connection failures.
- High CPU/memory usage.
- Repeated authentication failures.
- Payment failure spike.
- Signup failure spike.
- Queue/backlog growth.

## Alert quality

Avoid alerts that are so noisy that the team ignores them.

Each alert should have:
- a meaningful threshold
- a clear owner
- enough context to investigate
- a practical response path

---

# 10. Rate Limiting

## Core principle

Protect backend resources from spam, abuse, accidental request storms, and poorly behaved clients.

## Check for

- API-level rate limiting.
- Per-IP limits where appropriate.
- Per-user limits where appropriate.
- Per-endpoint limits for sensitive or expensive operations.
- Authentication endpoint limits.
- Password reset/request limits.
- Search or expensive query limits.
- Appropriate HTTP 429 responses.
- Retry guidance such as Retry-After where appropriate.
- Rate limits at the API gateway, reverse proxy, or backend.

## Important balance

Rate limits should protect the service without unnecessarily blocking legitimate users.

Consider different limits for:
- public endpoints
- authenticated users
- expensive endpoints
- authentication
- administrative endpoints

---

# Full Production Audit Workflow

When reviewing a project, follow this order.

## Step 1 — Understand the architecture

Identify:
- frontend framework
- backend framework
- database
- authentication system
- hosting/deployment platform
- API structure
- external services
- file storage
- background jobs
- monitoring/logging tools

Do not assume technologies that are not present.

## Step 2 — Inspect deployment safety

Check:
- versioning
- deployment process
- rollback
- migrations
- backups
- feature flags

## Step 3 — Inspect security boundaries

Check:
- input validation
- sanitization/encoding
- SQL/query safety
- authentication
- authorization
- password reset
- CORS
- secrets handling
- rate limiting

## Step 4 — Inspect reliability

Check:
- frontend error handling
- backend error handling
- loading/empty states
- logging
- monitoring
- alerts
- health checks

## Step 5 — Inspect database performance

Check:
- common queries
- filters
- joins
- sorting
- indexes
- query plans
- unnecessary indexes

## Step 6 — Produce actionable findings

For every issue, provide:

### Finding
What is missing or risky.

### Why it matters
The practical consequence.

### Evidence
The file, component, endpoint, configuration, or behavior that led to the finding.

### Recommended fix
The concrete change to make.

### Priority
Use:
- Critical
- High
- Medium
- Low

Do not assign a priority merely because something is theoretically possible. Base it on actual exposure, impact, and likelihood.

### Implementation
When useful, provide exact code/configuration changes.

---

# Preferred Audit Output

Use this structure unless the user requests another format:

## Production Readiness Summary

Briefly state what areas were checked and the overall state without using arbitrary numeric scores.

## Critical Issues

- Issue
- Why it matters
- Where it occurs
- Fix

## Security

### Validation & Sanitization
- Status
- Findings
- Fixes

### Authorization
- Status
- Findings
- Fixes

### Password Reset
- Status
- Findings
- Fixes

### CORS
- Status
- Findings
- Fixes

### Rate Limiting
- Status
- Findings
- Fixes

## Reliability

### Rollback
### Frontend Error Handling
### Logging
### Monitoring & Alarms

## Performance

### Database Indexes
### Expensive Queries
### API Performance

## Pre-Deployment Checklist

- [ ] Known-good version can be redeployed.
- [ ] Rollback procedure tested.
- [ ] Database migrations reviewed.
- [ ] User input validated server-side.
- [ ] Dangerous output safely encoded/sanitized.
- [ ] Parameterized database queries used.
- [ ] Frontend failures have useful fallback states.
- [ ] Production logs contain useful context.
- [ ] Secrets are not logged.
- [ ] Password-reset tokens expire.
- [ ] Reset tokens are single-use.
- [ ] CORS allows only intended origins.
- [ ] Authorization is enforced server-side.
- [ ] Important metrics have alerts.
- [ ] API rate limits are configured.
- [ ] Frequently used database queries have appropriate indexes.
- [ ] Backups/recovery procedures are understood.
- [ ] Health checks are available.
- [ ] Production configuration has been reviewed.

---

# Behavior Rules

1. Prefer evidence from the actual project over generic advice.
2. Do not claim a protection exists unless the code/configuration demonstrates it.
3. Do not recommend unnecessary rewrites.
4. Preserve working features unless they create a security or reliability problem.
5. Explain technical findings in beginner-friendly language when the user appears to be a student or beginner.
6. Give complete copy-paste-ready code when the user asks for implementation and enough project context is available.
7. If a required project file is missing, ask for it rather than inventing its contents.
8. Separate security, reliability, performance, and deployment concerns.
9. Treat frontend controls as user-interface controls, not security boundaries.
10. When reviewing database changes, consider both the current application version and rollback compatibility.
11. Prefer small, testable changes over broad refactors.
12. After fixes, recommend testing the exact failure scenario that the fix is intended to prevent.

# Quick Mental Model

A production-ready application should answer these questions:

**Deployment**
- Can we safely go back if the new release breaks?

**Input**
- What happens if a user sends unexpected or malicious data?

**Frontend**
- What does the user see when something fails?

**Database**
- Are common queries efficient without over-indexing?

**Logs**
- Can developers diagnose a production problem?

**Authentication**
- Can an old password-reset link still be abused?

**CORS**
- Which browser origins are allowed to call the backend?

**Authorization**
- Can a user access another user's data by changing an ID?

**Monitoring**
- Will the team know when important things start failing?

**Rate limiting**
- Can one client overwhelm the backend?

Use these questions as the minimum production-readiness review.
