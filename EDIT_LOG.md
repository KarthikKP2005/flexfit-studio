# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-04 — Include Corporate Bookings in Trainer "Booked Count"
- **Type**: FIX
- **Defect ID**: TRAINER-04
- **Behavior change**: Yes — the trainer schedule UI now shows the total sum
  of personal and corporate bookings, instead of just personal bookings.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/server/routers/trainers.ts` — updated `upcomingClasses` to include
    a second subquery for `corporateBookedCount` and sum it into
    `totalBookedCount`. Added full Rule 5 docstring and inline comments.
  - `src/app/trainer/schedule/page.tsx` — (touched in previous commit, but
    stats row was updated to render `totalBookedCount` and break it down
    visually when corporate bookings exist).
- **Tests added/updated**: n/a (characterization tests deferred)
- **Summary**: Previously, trainers could only see the count of attendees
  who booked with a personal membership. Corporate members were invisible
  to them, leading to trainers showing up to what they thought was an empty
  class, only to find 10 corporate members waiting. The `upcomingClasses`
  query now explicitly counts both tables and returns a unified total.
- **AI tool note**: Logic and docstrings authored with AI assistance.
