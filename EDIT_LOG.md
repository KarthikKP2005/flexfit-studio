# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-02 — Trainer Roster By Name (Normal + Corporate Combined)
- **Type**: FIX
- **Defect ID**: TRAINER-02
- **Behavior change**: Yes — trainers can now see individual member names,
  emails, and booking status in an expandable roster on `/trainer/schedule`.
  Previously only aggregate booked-count was visible.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/server/routers/trainers.ts` — added `rosterWithCorporate` procedure
    with full Rule 5 docstring and file-level header.
  - `src/app/trainer/schedule/page.tsx` — added ClassCard component with
    expandable roster panel, file-level header, component docstrings, and
    roster-rendering loop intent comments.
- **Tests added/updated**: n/a (characterization tests deferred — see
  known-issues.md re: vitest configured but no test files exist yet)
- **Summary**: Before this fix, the trainer schedule page showed only a number
  for how many members were booked. Trainers couldn't do roll-calls or know
  who was attending. The `rosterWithCorporate` procedure queries both the
  `bookings` and `corporateBookings` tables, joins each to `users` for names,
  merges the results, and sorts chronologically by `bookedAt`. The UI lazily
  loads the roster only when the trainer clicks "View Roster" to avoid N+1
  API calls on page load.
- **AI tool note**: Code authored with AI assistance (Antigravity IDE). Every
  line reviewed and confirmed accurate.
