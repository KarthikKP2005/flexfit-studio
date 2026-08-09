# Architecture Decisions

This file tracks major structural changes to the codebase, as required by `AGENT_RULES.md` Rule 1.2.

## 2026-08-09: `studio_settings` Table
**Context:** The application previously had a hardcoded 30-minute check-in window. To support enterprise/professional administration, the studio needs to configure rules dynamically without redeploying code.
**Decision:** Added a `studioSettings` table to `src/db/schema.ts` to hold global configuration values, starting with `checkinWindowMinutes`.
**Consequences:** 
- A migration (`db:push`) is required.
- Routers that depend on time boundaries (e.g., `bookings.ts` and `corporate-bookings.ts` `markAttended`) must now execute a read query against this table before validating.
- The Admin dashboard requires a new UI panel to manage these settings.
