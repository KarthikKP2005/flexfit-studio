# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-08 — Validate Trainer Assignment on Class Creation
- **Type**: FIX
- **Defect ID**: TRAINER-08
- **Behavior change**: Yes — class creation and updates now reject the request
  if the assigned `trainerId` does not exist, belongs to a non-trainer user,
  or belongs to a deactivated trainer.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/server/routers/classes.ts` — added inline comments to the trainer
    validation blocks in `create` and `update` procedures explaining the business
    rule (Rule 5).
- **Tests added/updated**: n/a (characterization tests deferred)
- **Summary**: Previously, staff could assign any arbitrary user ID (including
  members or deactivated trainers) to lead a class, because the API blindly
  accepted the ID without checking the `users` table. Now the API guarantees
  that the assigned trainer is valid and active before committing the class
  to the schedule.
- **AI tool note**: Comments authored with AI assistance.
