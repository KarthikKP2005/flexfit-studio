# FlexFit Studio — Restructuring Plan (Project 1, Item A)

Full end-to-end plan for the "restructure and rewrite to sensible modern
Next.js/TypeScript practice" ask in `plan.md` Item A, written before any
code moves (per Item A's own "we mark whether the structure makes sense
and whether you can explain why you picked it"). Supersedes the informal
discussion that produced it — this is the version to actually follow.

Every phase is designed so that **stopping at any phase boundary leaves
the repo in a defensible, honestly-documented state.** Nothing here should
ever be half-done and undocumented at the same time.

---

## Decisions needed before starting (flagged, not guessed — Rule 8)

These three are genuinely open and should be picked before Phase 2 begins:

1. **Commit granularity on this branch (`restructure-project1`).**
   `admin-update-two` used one bundled commit at explicit user request,
   overriding Rule 4/8. Recommended default here: **go back to strict
   one-commit-per-change** (one REFACTOR per extraction, one FIX per
   defect) — the deadline is no longer forcing the shortcut, and Rule 4's
   discipline is what makes this restructuring reviewable/defensible.
2. **Data model stance.** Item B says leaving the schema alone is fine;
   changing it is also fine "if you think the design needs it" — either
   way it wants a decision you can defend, not silence. Recommended
   default: **state explicitly, in one `architecture-decisions.md`
   paragraph, that the core schema is being left as-is** (a few
   incidental changes already happened — e.g. `COMPANY-001`'s unique
   constraint on `companyMembers.userId` — call those out as the
   exceptions, not evidence of a broader redesign).
3. **Transactions are not bundled into extraction REFACTORs.** When
   Phase 2 moves logic into a new service file, that move must stay
   byte-for-byte behavior-identical per Rule 3. Wrapping the newly
   co-located multi-step operations in a real DB transaction (closing
   plan.md item #44) is a **separate FIX commit, with its own defect ID,
   done after the extraction lands** — not silently bundled in.

---

## Phase 0 — Foundation — ✅ done (2026-08-15)

Must happen first; nothing else is safe to build on top of it.

1. ✅ **Corrected the fabricated `architecture-decisions.md` test-harness
   entries.** Turned out to be more nuanced than first assumed — see that
   file's two 2026-08-15 entries for the full story (a smaller, real,
   stale attempt exists on `origin/fix/testing`; the specific elaborate
   `tests/setup/` design described in the five original entries still
   never existed anywhere, confirmed including dangling/unreachable
   commits, not just branch tips).

2. ✅ **Corrected the second fabricated promise.** Wrote the
   `classes.ts`/`adminClasses.ts` duplication entry into
   `architecture-decisions.md` that `CLASS-005` had promised but never
   delivered. Resolution itself still open — tracked below in Phase 2
   item 5, unchanged.

3. ✅ **Built the real, minimal test harness.** `vitest.config.ts`,
   `drizzle.test.config.ts`, `src/tests/setup.ts`
   (`createTestCaller`/`resetDb`, two functions, nothing else), and a
   first real test file (`adminClasses.test.ts`, 3 tests covering
   `TRAINER-003`) — all passing. Full detail in `EDIT_LOG.md`'s
   2026-08-15 `TEST(infra)` entry.

4. ✅ **Build/lint gate confirmed clean**: `tsc --noEmit`, `pnpm test`,
   `pnpm build` all pass as of this phase's completion. `pnpm lint`
   (`next lint`) is **not actually configured in this project** — running
   it triggers an interactive "set up ESLint" wizard rather than linting
   anything, and can't run non-interactively. Pre-existing gap, not
   something this phase broke; out of scope to set up mid-restructure.
   Noted here so it isn't silently assumed to be a passing gate later.

**Also discovered mid-phase, not originally planned:** several
root-level docs (`AGENT_RULES.md`, `EDIT_LOG.md`, `plan.md`) were moved
into `documents/` for consolidation — noted here since every reference
to those files elsewhere in this plan should now be read as
`documents/AGENT_RULES.md` etc.

---

## Phase 1 — Make the restructuring defensible (docs before code) — ✅ done (2026-08-15)

Written *before* moving code, so the plan is reviewable, not
reverse-engineered after the fact:

- ✅ **`documents/system-map.md`** — Page → tRPC procedure → validation →
  business rules → DB → side-effects, for every router (75+ procedures
  across 16 routers), plus the backend-only-procedure list.
- ✅ **`documents/behavior-inventory.md`** — focused specifically on the
  features Phase 2 will touch (attendance, booking, waitlist, reschedule,
  class scheduling, admin reports), in plan.md's own requested table
  format, so each extraction has a concrete "must not change" reference.
- ✅ **`documents/refactor-map.md`** — the actual target layout (backend
  `src/features/` tree + frontend `src/features/*/components/` tree),
  one line of *why* per new module, written before any Phase 2/3 move.
- ✅ **Schema-stance paragraph** in `architecture-decisions.md` — core
  schema left as-is, reasoning recorded (the two-table
  `bookings`/`corporateBookings` split was considered for consolidation
  and explicitly kept).

---

## Phase 2 — Backend restructuring

Every item: characterize with a real committed test (Phase 0's harness)
→ classify REFACTOR → move-only commit → separate clean-up commit (Rule
1.3) → re-run tests → comment (Rule 5) → log (`EDIT_LOG.md`) → commit.
Writing each characterization test also backfills real regression
coverage for whatever already-fixed defects live in that file (e.g.
touching `bookings.ts` for the extraction below naturally covers
`BOOK-004`; touching `admin.ts` covers `ADMIN-001`) — not a separate
effort, a side effect of doing this properly.

Current sizes (real, checked — not from memory):

| File | Lines |
|---|---|
| `reschedules.ts` | 580 |
| `bookings.ts` | 528 |
| `corporate-bookings.ts` | 453 |
| `admin.ts` | 384 |
| `admin-companies.ts` | 269 |
| `members.ts` | 239 |
| `classes.ts` | 227 |
| `auth.ts` | 194 |
| `trainers.ts` | 181 |
| `payments.ts` | 179 |
| `adminClasses.ts` | 177 |

Ordered by value/risk:

1. ✅ **`attendance-service.ts`** (`src/features/bookings/`) — done
   (2026-08-15). Dedupes `markAttended` between `bookings.ts` and
   `corporate-bookings.ts`. Found and documented a real, previously-
   unknown quirk while extracting (`CORP-006`: corporate check-ins
   always record `source: "front_desk"` regardless of the real source) —
   preserved exactly, not silently fixed, per Rule 3. 8/8 characterization
   tests pass before and after. `tsc --noEmit`/`pnpm build` clean.
2. ✅ **`booking-policy.ts`** (pure functions, no DB) — done (2026-08-15).
   `hoursUntil`, `assertClassBookable`, `assertNoActiveBooking` shared
   across `bookings.book` and `corporateBookings.book`. Membership vs.
   company credit checks stay in each router (nothing shared there — two
   genuinely different eligibility sources). `hoursUntil`'s third copy in
   `reschedules.ts` deliberately left for item 6. 9/9 new tests
   (17 total) pass before and after. `tsc --noEmit`/`pnpm build` clean.
3. ✅ **`reschedule-policy.ts`** / `evaluateReschedule` — done
   (2026-08-15). Closes plan.md item #53. Single decision function now
   used by both `reschedule` and `validateReschedule`; the mutation
   still re-derives its own decision rather than trusting a client
   preview. 9/9 new tests (26 total) pass before and after, covering all
   four credit-transition outcomes (RESCH-001/002), RESCH-004's
   equal-cost check, and RESCH-003's waitlist promotion. `tsc --noEmit`/
   `pnpm build` clean. Biggest, highest-risk item in the plan — done.
4. **Split `admin.ts`** (384 lines, several unrelated concerns) —
   utilisation reporting, revenue reporting, attendance/no-show, into
   `src/features/reports/` and `src/features/attendance/`; router stays
   thin.
5. **Resolve the `classes.ts` / `adminClasses.ts` duplication** (Phase 0
   item #2) — consolidate the duplicate `create` logic, or explicitly
   document why the two routers stay separate (staff-facing vs.
   admin-facing contracts, if that's the real reason).
6. **`business-time.ts`** (or similar, under `src/lib/`) — centralizes
   `hoursUntilClass`, `businessDate`, `isMembershipActive`,
   `isCancellationRefundable`, `formatBusinessDateTime`, currently
   scattered across `bookings.ts`, `corporate-bookings.ts`,
   `reschedules.ts`, `plans.ts`, `trainers.ts`, and `src/lib/format.ts`
   (plan.md item #55). **Do not change timezone semantics while doing
   this** — pure move, `TRAINER-002`'s UTC-vs-local bug stays exactly as
   documented, not silently fixed here.
7. **Lower priority, only if time remains:** `admin-companies.ts`,
   `members.ts`, `classes.ts`, `trainers.ts` — smaller, less duplicated.

---

## Phase 3 — Frontend restructuring

Previously skipped (no browser available to verify pixel/behavior-identical
output that session). Now unblocked — use the `run` skill to launch the
dev server and verify each extraction against the real running app, not
just `tsc --noEmit`.

Real sizes, corrected against actual line counts (the original plan
picked five pages from memory and missed six):

| File | Lines | Status |
|---|---|---|
| **`trainer/schedule/page.tsx`** | **552** | **#1 priority — bigger than every backend router** |
| `schedule/page.tsx` | 369 | added |
| `dashboard/page.tsx` | 369 | |
| `admin/classes/page.tsx` | 296 | added — tied to Phase 2 item 5 |
| `admin/companies/[id]/page.tsx` | 285 | |
| `kiosk/page.tsx` | 224 | |
| `admin/companies/page.tsx` | 183 | added |
| `admin/plans/page.tsx` | 176 | added |
| `admin/page.tsx` (main dashboard) | 176 | added |
| `admin/reports/page.tsx` | 170 | added |

For each: extract business logic/local state into a feature component
under `src/features/*/components/`, leave the page as route-level
composition (plan.md item #54's own example: `export default function
KioskPage() { return <CheckInKiosk /> }`). Verify with a real
before/after click-through in the running app.

---

## Phase 4 — Route groups (optional, do last, highest risk)

`app/(member)/`, `app/(staff)/`, `app/(admin)/` per plan.md item #41 —
a real file-move refactor touching Next.js routing itself. Only attempt
after Phases 0–3 are solid; a routing mistake is the easiest way to
visibly break the app right before submission.

---

## Phase 5 — Close remaining `known-issues.md` gaps where it's now worth it

Re-triage the 14 "documented, not fixed" items once Phases 0–2 land —
some (e.g. `AUTH-001` passwordHash leak, `CLASS-002` capacity-below-occupancy)
become worth actually fixing now that there's time, rather than staying
logged-and-left.

---

## Phase 6 — Final pass

1. Update `architecture-decisions.md` with the real, final structure and
   reasoning (supersedes Phase 1's draft where they diverge).
2. Confirm every touched file meets Rule 10's Definition of Done checklist.
3. Final `EDIT_LOG.md` review — every entry has type, defect ID or n/a,
   behavior-change Y/N, files, tests.
4. **Full end-to-end smoke test** — not per-phase spot checks, one final
   pass walking all three golden paths in the running dev server: member
   books/waitlists/cancels/reschedules a class; trainer checks someone
   in; admin cancels a class, swaps a trainer, refunds a payment. This is
   the step that catches anything the phase-by-phase verification missed.
5. Final `pnpm build` + `tsc --noEmit` + `next lint`, clean.
