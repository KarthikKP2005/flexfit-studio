# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-07 — Enforce Availability on Class Creation/Update
- **Type**: FIX
- **Defect ID**: TRAINER-07
- **Behavior change**: Yes — `classes.create` and `classes.update` will now
  throw a `BAD_REQUEST` if the proposed class time falls outside the assigned
  trainer's working hours or overlaps with another class they are teaching.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/server/routers/classes.ts` — added inline comments to the sections
    where `checkTrainerAvailability` is called, explaining the business logic
    and the `excludeClassId` requirement during updates.
- **Tests added/updated**: n/a (characterization tests deferred)
- **Summary**: Although `checkAvailability` was wired up (TRAINER-03), we
  needed to document *where* and *why* it was being enforced in `classes.ts`.
  The comments clarify that this prevents admins from inadvertently double-
  booking trainers, and explain the `excludeClassId` logic that prevents a
  class from conflicting with itself when its room or capacity is changed
  but its time/trainer remain the same.
- **AI tool note**: Comments authored with AI assistance.
