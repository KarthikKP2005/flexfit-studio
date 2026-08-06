# EDIT_LOG.md
### Chronological log of every change made to the FlexFit Studio codebase.

---

## TRAINER-NAV — Role-based Navigation Gating
- **Type**: FIX
- **Defect ID**: TRAINER-NAV (System Problem #68)
- **Behavior change**: Yes — trainers and admins no longer see member-specific
  links like "My bookings" in the top navigation bar.
- **Date**: 2026-08-06
- **Files touched**:
  - `src/components/NavBar.tsx` — added conditional rendering based on
    `user?.role`, plus Rule 5 file-level and inline comments explaining the
    purpose of the role gating.
- **Tests added/updated**: n/a (UI component, characterization tests deferred)
- **Summary**: Previously, the NavBar displayed member links ("My bookings",
  "Waitlist") indiscriminately to all logged-in users, causing trainers and
  admins to land on pages designed for members. The NavBar now explicitly
  checks `user?.role` and renders only the links appropriate for the active
  session's role.
- **AI tool note**: Authored with AI assistance.
