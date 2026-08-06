# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-01 — Trainers Cannot Cancel or Edit Own Classes
- **Type**: DOCUMENT
- **Defect ID**: TRAINER-01
- **Behavior change**: No
- **Date**: 2026-08-06
- **Files touched**: `documents/known-issues.md`
- **Tests added/updated**: n/a (no code change)
- **Summary**: Documented the known limitation that trainers have no UI or
  permission to cancel/edit their own classes. The backend endpoints are gated
  behind `staffProcedure`/`adminProcedure`. This is an intentional design gap
  documented in `finallist_phase1.docx` (Trainer Problem #1). The entry in
  `known-issues.md` explains severity, why it wasn't fixed, and what a fix
  would look like.
- **AI tool note**: Entry authored with AI assistance (Antigravity IDE). Content
  reviewed and confirmed accurate against the codebase.
