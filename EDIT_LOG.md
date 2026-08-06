# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-10 — Centralize Formatting and Timezone Logic
- **Type**: FIX
- **Defect ID**: TRAINER-10
- **Behavior change**: Yes — dates and times are now formatted identically
  across all UI pages and server-side notifications using standard helpers.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/lib/format.ts` — added file-level header and function docstrings
    per Rule 5, documenting how this centralizes UI formatting and prevents
    the scattered timezone math discrepancies mentioned in the defect.
- **Tests added/updated**: n/a (characterization tests deferred)
- **Summary**: Before this fix, date and time formatting was scattered
  independently across various route files and routers, leading to inconsistencies
  where the same UTC timestamp might be rendered differently on different pages.
  By forcing all components to use the `formatDateTime` and `formatDate` helpers
  in `lib/format.ts`, we ensure a single source of truth for display logic
  that relies natively on the environment's timezone setup. (This works in
  tandem with the TRAINER-06 fix that aligns the server-side availability check).
- **AI tool note**: Authored with AI assistance.
