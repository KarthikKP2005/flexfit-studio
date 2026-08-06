# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-06 — Local Time for Availability Checks
- **Type**: FIX
- **Defect ID**: TRAINER-06
- **Behavior change**: Yes — trainer availability checks now evaluate class
  times against local timezone days/hours instead of UTC, matching the UI.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/server/routers/trainers.ts` — replaced `getUTCDay()` and
    `getUTCHours()` with their local equivalents `getDay()` and `getHours()`
    in the `checkTrainerAvailability` helper. Added inline comments explaining
    the business rule rationale per Rule 5.
- **Tests added/updated**: n/a (characterization tests deferred)
- **Summary**: The UI asks trainers to input availability in their local
  timezone (e.g., "Mondays from 9am to 5pm"). However, the server was checking
  against UTC. For a trainer in New York (UTC-5), a 9am Monday class evaluates
  as 2pm Monday UTC. This discrepancy caused valid slots to be rejected and
  invalid slots to be accepted depending on the time difference. The fix
  aligns the server-side math to use the same local boundaries the UI displays.
- **AI tool note**: Authored with AI assistance.
