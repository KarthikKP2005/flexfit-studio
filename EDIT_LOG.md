# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-09 — Corporate Check-ins Missing from Trainer Stats
- **Type**: DOCUMENT
- **Defect ID**: TRAINER-09
- **Behavior change**: No
- **Date**: 2026-08-06
- **Files touched**: `documents/known-issues.md`
- **Tests added/updated**: n/a (no code change)
- **Summary**: Documented the known limitation that the `checkins` table
  only contains a foreign key to the `bookings` table, meaning there is no
  way to structurally link a kiosk check-in to a `corporateBookings` record.
  This means corporate attendees do not increment the trainer's class check-in
  counter. Fixing this requires a database schema change, which is deferred
  per AGENT_RULES.md (Rule 1.2: no casual schema changes).
- **AI tool note**: Entry authored with AI assistance.
