# EDIT_LOG.md

Running record of every change made under AGENT_RULES.md, newest first.
Each entry: what changed, why, files touched, tests added/updated, defect
ID if applicable, and whether behavior changed.

AI tool usage note (Rule 9): all entries below were written with Claude
Code (Sonnet 5) in an interactive session — I reviewed and approved every
diff before it landed; nothing here was auto-applied.

---

## 2026-08-15 — REFACTOR(dashboard): extract MemberDashboard, verified live in a browser

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — every JSX element, className, trpc call, and
piece of state logic moved verbatim.
**Files:**
- `src/features/dashboard/components/MemberDashboard.tsx` (new) — the
  entire previous contents of `dashboard/page.tsx`, moved
  character-for-character except the component's own name.
- `src/app/dashboard/page.tsx` — now route-level composition only. Was
  369 lines, now 8.
**Tests:** verified live — dev server + headless Chromium (Playwright),
logged in as the company-linked seeded member. Confirmed both the
personal membership card (plan, status, credits, renewal date) and the
`COMPANY-002` corporate membership card (company name, status, credit
pool balance) render, the upcoming-bookings name filter works, and
reschedule history renders with correct from/to class/time/room detail.
Zero console errors. `tsc --noEmit` and `pnpm build` both clean, bundle
size unchanged.

Phase 3 of `documents/restructure-plan.md`, third item.

---

## 2026-08-15 — REFACTOR(schedule): extract ScheduleBrowser, verified live in a browser

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — every JSX element, className, trpc call, and
piece of state logic moved verbatim.
**Files:**
- `src/features/schedule/components/ScheduleBrowser.tsx` (new) — the
  entire previous contents of `schedule/page.tsx` (`ScheduleBrowser` +
  `BookButton`), moved character-for-character except the main
  component's own name.
- `src/app/schedule/page.tsx` — now route-level composition only. Was
  369 lines, now 9.
**Tests:** verified live — dev server + headless Chromium (Playwright).
Checked signed-out view (day filter, name/date filters, "Sign in to
book a class"), the name filter actually narrowing results ("Yoga" →
only Sunrise Yoga rows), and signed-in as a company-linked member:
confirmed the `BookButton`'s click-to-expand behavior still works
exactly as coded — a company-linked member's first click expands to
"Personal credits"/"TechCorp Inc credits" rather than booking
immediately, matching `CORP-005`'s documented behavior precisely,
nothing guessed. Zero console errors. `tsc --noEmit` and `pnpm build`
both clean; `/schedule`'s bundle size unchanged (2.9kB → 2.92kB, noise).

**Environment note:** two dev-server instances from earlier sessions
were still listening on ports 3000-3003 (`lsof`-based kills weren't
reaching them on this Windows/git-bash setup), causing the Playwright
driver script to hit whichever stale instance answered first on
whatever port it happened to occupy. Fixed with a `netstat`-based PID
lookup + `taskkill //F`,
confirming exactly one server on exactly one port before driving it —
worth doing this way going forward for any further Phase 3 items.

Phase 3 of `documents/restructure-plan.md`, second item.

---

## 2026-08-15 — REFACTOR(trainer-schedule): extract TrainerScheduleView, verified live in a browser

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — every JSX element, className, trpc call, and
piece of state logic moved verbatim, no rewrites. Verified against the
real running dev server (not just `tsc`/`pnpm build`), per this file's
own earlier note that the previous session had to defer this exact
extraction for lack of browser access.
**Files:**
- `src/features/trainers/components/TrainerScheduleView.tsx` (new) —
  the entire previous contents of `trainer/schedule/page.tsx` (`ClassCard`,
  `DAYS`, and the main content component, now exported as
  `TrainerScheduleView`), moved character-for-character except the
  component's own name.
- `src/app/trainer/schedule/page.tsx` — now route-level composition only
  (plan.md item #54's own pattern): `RequireRole` wrapping
  `TrainerScheduleView`. Was 552 lines, the single largest file in the
  app; now 25.
**Tests:** no unit tests apply to a pure JSX move. Verified live instead:
launched the dev server, logged in as the seeded trainer
(`arjun@flexfit.test`), and drove the actual page with a headless
Chromium session (Playwright, since `chromium-cli` wasn't available in
this environment) — confirmed the Trainer Dashboard header, all three
metric cards, both tabs (Upcoming Classes / Weekly Availability), the
name/date filters, expanding a class card's roster (Booked/Waitlist
sub-tabs, member names, Check In buttons), and the availability day
editor (Edit/Save/Cancel/Remove) all render and behave identically to
before. Zero console errors. `tsc --noEmit` and `pnpm build` both clean;
`/trainer/schedule`'s bundle size unchanged (3.88kB → 3.86kB, packaging
noise only).

**Gotcha hit, worth recording:** the first dev-server attempt 404'd on
Next.js's own hydration chunks because a `pnpm build` (production build)
had run immediately before `pnpm dev`, leaving a stale `.next/` in a
state dev mode didn't expect — buttons rendered but had no attached
React handlers. Fixed by deleting `.next/` before starting dev. Separately,
port 3000 was still held by an earlier backgrounded dev server (`npm`
wrapper doesn't forward `SIGTERM` to the child it spawns, so the `lsof`
kill didn't reach it) — Next.js silently moved to port 3002 instead,
which the driver script had to be pointed at explicitly.

Phase 3 of `documents/restructure-plan.md`, first item — the largest
frontend file in the app, done and verified live.

---

## 2026-08-15 — REFACTOR(reschedules): close the last hoursUntil duplicate, no new business-time.ts module

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — identical one-line function body, existing
`reschedule.test.ts` (9 tests exercising `hoursUntil` via the window and
target-started checks) re-run unchanged.
**Files:**
- `src/server/routers/reschedules.ts` — removed its local `hoursUntil`
  definition, now imports it from `@/features/bookings/booking-policy`
  (already used by `bookings.ts`/`corporate-bookings.ts` since Phase 2
  item 2).
- `src/features/bookings/booking-policy.ts`,
  `src/features/reschedules/reschedule-policy.ts` — header comments
  updated; both previously said this dedup was deferred to "Phase 2 item
  6 / business-time.ts."
**Tests:** none new — `hoursUntil` was already covered by
`reschedule.test.ts`'s existing 9 tests. `tsc --noEmit` and `pnpm build`
both clean.

**Scope note, per explicit instruction not to refactor beyond what's
actually needed:** checked whether the rest of plan.md item #55's named
functions (`businessDate`, `isMembershipActive`,
`isCancellationRefundable`, `formatBusinessDateTime`) exist as real
duplicated code anywhere in the current codebase — they don't.
`isMembershipActive`'s job is already covered by the already-extracted
`getCurrentMembership`. No dedicated `business-time.ts` module was
created; `hoursUntil` now lives in `booking-policy.ts`, which is where
it already was. Phase 2 item 6 is complete with this one small change,
not a new module.

Phase 2 item 6 of `documents/restructure-plan.md` — **Phase 2 is now
fully complete.**

---

## 2026-08-15 — DOCUMENT(classes): resolve classes.ts vs adminClasses.ts as an intentional split, not consolidated

**Type:** DOCUMENT
**Defect:** n/a — architecture finding, not a defect ID
**Behavior change:** no — no code touched.
**Files:** `documents/architecture-decisions.md` — rewrote the Phase 0
entry on this topic with the complete finding.

Attempted the actual consolidation this Phase 2 item called for — read
both `classesRouter.create` and `adminClassesRouter.create` in full,
side by side. They turned out not to be simple duplicated logic: they
differ in `trainerId` optionality (optional vs. required), trainer-role
validation (`adminClasses` validates the referenced user is an active
trainer; `classes.ts` doesn't — this is `CLASS-003` manifesting
concretely as a disagreement between the two routers), and return shape
(full row vs. `{ ok: true }`). A shared extraction would have had to
either parameterize away all three differences (leaving almost nothing
shared) or pick one behavior as canonical — silently fixing or
reintroducing `CLASS-003` in the process. Neither qualifies as a
behavior-identical REFACTOR under Rule 3.

**Resolution:** kept both routers exactly as they are. This is a
DOCUMENT-type resolution, not a REFACTOR — the duplication is now
precisely understood and recorded rather than merged based on a guess
about which validation strictness is correct (Rule 8).

Phase 2 item 5 of `documents/restructure-plan.md` — resolved via
documentation rather than code consolidation.

---

## 2026-08-15 — REFACTOR(admin): split classUtilisation/revenue/attendance queries out of admin.ts

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — verified via characterization tests written
against the unmodified code first; all 6 new tests (32 total) pass
identically before and after, including the `ADMIN-003` bug (see below),
preserved exactly.
**Files:**
- `src/features/reports/utilisation-service.ts` (new) —
  `getClassUtilisation`.
- `src/features/reports/revenue-service.ts` (new) — `getRevenueByMonth`,
  `getRevenueByMethod`.
- `src/features/attendance/no-show-service.ts` (new) —
  `getCheckinsPerDay`, `getTopTrainers`, `getNoShowList`.
- `src/server/routers/admin.ts` — those six procedures are now one-line
  calls into the services above; removed now-unused `desc`/`inArray`
  imports. `stats`, `trainerPayroll`, `settings`/`updateSettings`,
  `runMembershipExpiryCheck`, `expiringMemberships`, `refundCount` stay
  inline — outside this extraction's stated scope (see
  `restructure-plan.md` Phase 2 item 4).
**Tests:** `src/server/routers/admin-reports.test.ts` (new, 6 tests).
`tsc --noEmit` and `pnpm build` both clean.

**Found, not fixed, while writing the characterization test:** `ADMIN-003`
— `classUtilisation`'s `booked` count always evaluates to `0`, confirmed
against the real `flexfit.db` (not just the test DB) for classes with
real double-digit booking counts. Root cause isolated to how drizzle-orm
compiles a correlated subquery used as a selected column — raw SQL with
the identical shape returns correct counts. `classes.list`'s `spotsLeft`
uses the exact same buggy pattern (a second call site, not touched by
this extraction, documented as the same defect). Not an overbooking
risk — `capacity-service.ts`'s actual capacity enforcement uses a
different, unaffected query shape — but it is a real, previously-
undiscovered display bug on both the admin dashboard and the public
`/schedule` page. Preserved exactly per Rule 3, new `known-issues.md`
entry written, left as a Phase 5 FIX candidate.

Phase 2 item 4 of `documents/restructure-plan.md`.

---

## 2026-08-15 — REFACTOR(reschedules): extract evaluateReschedule, close the reschedule/validateReschedule duplication

**Type:** REFACTOR
**Defect:** n/a — pure extraction, closes plan.md item #53's duplication
finding (not a defect ID, an architecture finding)
**Behavior change:** no — verified via characterization tests written
against the unmodified code first; all 9 new tests (26 total across the
suite) pass identically before and after.
**Files:**
- `src/features/reschedules/reschedule-policy.ts` (new) —
  `evaluateReschedule(db, userId, input, freeRescheduleHours,
  hoursUntil)`, a single side-effect-free decision function used by both
  `reschedule` (mutation) and `validateReschedule` (query), which
  previously implemented the same ~130 lines of validation
  independently. Returns a discriminated `RescheduleDecision` — either
  `{valid: false, code, reason}` (mutation throws `TRPCError({code,
  message: reason})`; query returns `{valid: false, reason}`, dropping
  `code`) or the full decision object the mutation's write steps need
  (`originalBooking`, `originalClass`, `targetClass`, `targetIsFull`,
  `becomingConfirmed`, `becomingWaitlisted`, `membership`,
  `newCreditsUsed`).
- `src/server/routers/reschedules.ts` — both `reschedule` and
  `validateReschedule` now call `evaluateReschedule`; `reschedule` keeps
  all its write steps (insert/update/cancel/promote/history-record)
  unchanged, just fed by the shared decision instead of inline
  validation. Removed now-unused `isClassFull` import. File header
  comment updated — it previously documented *why* this duplication was
  being left alone; that's no longer true.
**Tests:** `src/server/routers/reschedule.test.ts` (new, 9 tests) —
covers all four credit-transition outcomes (RESCH-001/002), the
equal-cost check (RESCH-004), original-class waitlist promotion
(RESCH-003), and that `validateReschedule`'s preview matches
`reschedule`'s real outcome for both a rejection and a success case.
`tsc --noEmit` and `pnpm build` both clean.

**Known, minor, non-behavioral difference, documented in
`reschedule-policy.ts`'s own header comment:** the original
`validateReschedule` only fetched the membership row when
`becomingConfirmed` was true; `evaluateReschedule` always fetches it
when `membershipId` exists (matching the mutation's original behavior),
so a preview call that isn't `becomingConfirmed` now runs one extra read
query it didn't before. No output or DB-write difference — a `SELECT`
has no side effects, and neither returned shape changed. Noted for
honesty per this branch's own standard (see `CORP-006`'s precedent),
not hidden.

Phase 2 item 3 of `documents/restructure-plan.md` — the biggest, highest-
risk item in the plan (largest file, most previously-fixed defects
riding on this exact logic). All four credit-transition bugs stayed
fixed through the extraction.

---

## 2026-08-15 — REFACTOR(bookings): extract booking-policy.ts, dedupe class-validity/duplicate-booking checks

**Type:** REFACTOR
**Defect:** n/a — pure extraction
**Behavior change:** no — verified via characterization tests written
against the unmodified code first; all 9 new tests (17 total) pass
identically before and after.
**Files:**
- `src/features/bookings/booking-policy.ts` (new) — `hoursUntil`,
  `assertClassBookable`, `assertNoActiveBooking`. `hoursUntil` is
  deduped between `bookings.ts` and `corporate-bookings.ts` only — a
  third copy in `reschedules.ts` is left alone on purpose, deliberately
  deferred to Phase 2 item 6 (`business-time.ts`) rather than closing 2
  of 3 copies now and leaving a mismatched third.
- `src/server/routers/bookings.ts` — `book` now calls the shared
  functions; local `hoursUntil` removed (import used instead, still
  used by `cancel` unchanged).
- `src/server/routers/corporate-bookings.ts` — same extraction.
**Tests:** `src/server/routers/booking.test.ts` (new, 9 tests) — written
first against unmodified code; all still pass after. `tsc --noEmit` and
`pnpm build` both clean.

Phase 2 item 2 of `documents/restructure-plan.md`.

---

## 2026-08-15 — REFACTOR(bookings): extract attendance-service.ts, dedupe markAttended

**Type:** REFACTOR
**Defect:** n/a — pure extraction, no defect fixed (see CORP-006 below
for a real bug *found* while doing this, deliberately not fixed here)
**Behavior change:** no — verified via characterization tests written
against the unmodified code first (Rule 5), then re-run unchanged
against the extraction; all 8 pass identically before and after.
**Files:**
- `src/features/bookings/attendance-service.ts` (new) —
  `assertBookingCheckable`, `assertCheckInWindow`,
  `getCheckinWindowMinutes`. The shared check-in policy both
  `bookings.markAttended` and `corporateBookings.markAttended` had
  independently, byte-for-byte.
- `src/server/routers/bookings.ts` — `markAttended` now calls the shared
  functions; removed unused `studioSettings` import; corrected a stale
  comment that incorrectly claimed no server-side check-in window
  existed (it always has).
- `src/server/routers/corporate-bookings.ts` — same extraction; removed
  unused `studioSettings` import; comment documents the `source`-field
  quirk found during this work (see `CORP-006`).
- `vitest.config.ts` — added `fileParallelism: false`. Reproduced
  `SQLITE_BUSY` directly once a second test file existed (two files
  opening concurrent connections to the same `flexfit.test.db`) —
  necessary infrastructure fix, not scope creep.
**Tests:** `src/server/routers/attendance.test.ts` (new, 5 tests) —
written first, against unmodified code, before any extraction; all
still pass after.

**Found, not fixed, while doing this:** `CORP-006` — corporate
check-ins never pass `source` to the `checkins` insert, so they always
record `"front_desk"` regardless of the real source. New
`known-issues.md` entry; separate FIX candidate for Phase 5.

Phase 2 item 1 of `documents/restructure-plan.md`.

---

## 2026-08-15 — DOCUMENT(restructure): Phase 1 docs — system map, behavior inventory, refactor map, schema-stance decision

**Type:** DOCUMENT
**Defect:** n/a — planning documentation, per `restructure-plan.md` Phase 1
**Behavior change:** no — documentation only, no application code touched.
**Files:**
- `documents/system-map.md` (new) — Page → tRPC procedure → validation →
  business rules → DB → side-effects for all 75+ procedures across 16
  routers, built from a fresh grep of every router's procedure list
  cross-referenced against every `trpc.*.useQuery/useMutation` call
  actually found under `src/app/**`/`src/components/**`, so the
  backend-only-procedure list (`plans.setActive`, `classes.create`/
  `update`/`cancel`, `members.setActive`/`setRole`, `payments.mine`/
  `markPaid`/`refund`) is verified, not remembered.
- `documents/behavior-inventory.md` (new) — plan.md's own requested
  table format (role/input/output/error/DB/UI/edge-cases), scoped to
  exactly the features Phase 2 will touch (attendance, booking,
  waitlist promotion, reschedule, class scheduling, admin reports) —
  the concrete "must not change" reference each extraction gets
  verified against.
- `documents/refactor-map.md` (new) — the target `src/features/` and
  `src/features/*/components/` trees, one line of *why* per module,
  written before any Phase 2/3 file move.
- `documents/architecture-decisions.md` — added the schema-stance
  decision (core schema left as-is; the `bookings`/`corporateBookings`
  two-table split was considered for consolidation and explicitly kept,
  reasoning recorded).
- `documents/restructure-plan.md` — Phase 0 and Phase 1 both marked done
  with what actually landed.
**Tests:** n/a — documentation only. `tsc --noEmit` and `pnpm test`
re-run to confirm no application code was touched; both clean.

---

## 2026-08-15 — CHORE: consolidate root-level docs into documents/

**Type:** CHORE
**Defect:** n/a
**Behavior change:** no — file moves only, no application code touched.
**Files:** `AGENT_RULES.md`, `EDIT_LOG.md`, `plan.md`,
`finallist_phase1.docx` moved from repo root into `documents/`; a stray
duplicate `architecture-decisions.md` that existed at root (separate
from the canonical `documents/architecture-decisions.md`) removed.
Content verified line-for-line identical after the move (2585/264/1698
lines respectively, matching the pre-move originals).
**Tests:** n/a — no code affected.

---

## 2026-08-15 — TEST(infra): build the real, minimal tRPC-caller harness

**Type:** TEST
**Defect:** n/a — infrastructure, not a bug fix
**Behavior change:** no — application code untouched; adds test tooling
and one new test file only.
**Files:**
- `vitest.config.ts` (new) — path alias + `DB_FILE` env override so the
  whole test run points at a disposable database, never `flexfit.db`.
- `drizzle.test.config.ts` (new) — same schema as `drizzle.config.ts`,
  pointed at `flexfit.test.db`.
- `package.json` — added `db:test:push` script.
- `src/tests/setup.ts` (new) — `createTestCaller(user)` and `resetDb()`,
  two functions total. Deliberately does not include the global-setup/
  fixtures/mock-next-headers ceremony the (fabricated) prior design
  described — see `architecture-decisions.md`'s 2026-08-15 correction
  entry.
- `src/server/routers/adminClasses.test.ts` (new) — first real,
  committed test file, covering `TRAINER-003` (`swapTrainer` rejects an
  unavailable trainer, succeeds for an available one, `NOT_FOUND` for a
  missing class id) at the tRPC-caller level per Rule 6.
**Tests:** 3 new tests, all passing (`pnpm test`). `tsc --noEmit` and
`pnpm build` both clean afterward.

This is Phase 0 of `documents/restructure-plan.md` — the prerequisite
for every REFACTOR in Phase 2, since Rule 5 requires a real
characterization test before touching a file's behavior, and up to now
that requirement was only being satisfied by temporary, untracked,
deleted-after-use scripts.

---

## 2026-08-15 — DOCUMENT(auth): log AUTH-005 (deactivating a user doesn't invalidate existing sessions)

**Type:** DOCUMENT
**Defect:** AUTH-005 (new — see `known-issues.md`)
**Behavior change:** no — comments and documentation only, no logic
touched.
**Files touched:**
- `documents/known-issues.md` — new `AUTH-005` entry: current behavior
  (`setActive` never touches `sessions`; `createContext` only checks
  `expiresAt`, never `user.active`), severity, and what a real fix would
  need to do (delete sessions on deactivation and/or check `active` in
  `createContext`).
- `src/server/routers/members.ts` — added a header comment to
  `setActive` (previously had none) naming `AUTH-005` directly.
- `src/server/trpc.ts` — `createContext`'s existing comment (which
  already described this exact gap in prose) now names `AUTH-005`
  instead of standing alone with no defect-log pointer.
**Tests:** n/a — comment/documentation-only change, no logic touched.

---

## 2026-08-15 — DOCUMENT(kiosk): log KIOSK-002 (kiosk never shows/checks in corporate bookings)

**Type:** DOCUMENT
**Defect:** KIOSK-002 (new — see `known-issues.md`)
**Behavior change:** no — code behavior is identical; only comments
changed.
**Files touched:**
- `documents/known-issues.md` — new `KIOSK-002` entry: current
  behavior, why it's asymmetric with the trainer roster (which already
  merges `bookings.rosterFor` and `corporateBookings.rosterFor`), and
  why it's deliberately left unfixed for now (plan.md's own required
  design is a unified check-in lookup + shared attendance service —
  more surface than a local fix, and plan.md itself lists corporate
  kiosk integration under "fix only with strong tests").
- `src/app/kiosk/page.tsx` — one line in the existing file-header
  comment now names `KIOSK-002` directly instead of describing the gap
  with no defect-log pointer.
**Tests:** n/a — comment/documentation-only change, no logic touched.

---

## 2026-08-15 — FIX(admin-classes): check trainer availability before swapTrainer reassigns a class

**Type:** FIX
**Defect:** TRAINER-003 (new — see `known-issues.md`)
**Behavior change:** yes — `adminClasses.swapTrainer` now rejects with
`BAD_REQUEST` if the new trainer isn't available at the class's time
(no availability row for that day, outside working hours, or already
double-booked), where before it reassigned unconditionally. Also now
throws `NOT_FOUND` for a nonexistent class id, matching every other
mutation in this router.
**Files touched:**
- `src/server/routers/adminClasses.ts` — `swapTrainer` now loads the
  class first and calls `isTrainerAvailable` (the same service
  `classes.ts`'s `create`/`update` and `adminClasses.ts`'s own `create`
  already use) before updating `trainerId`.
**Tests:** tRPC-caller-level verification via a temporary, untracked
script (`_tmp-e2e-test.ts`, deleted after use, never committed) — run
once against the unmodified code to reproduce TRAINER-003, then again
after the fix to confirm it. Full detail in the TRAINER-003 entry in
`known-issues.md`.

---

## 2026-08-15 — FIX(admin-classes): route cancel through the shared cancelClass service

**Type:** FIX
**Defect:** CLASS-005 (new — see `known-issues.md`)
**Behavior change:** yes — the admin panel's "Cancel" button now cancels
every active personal/corporate booking on the class, refunds credits,
and sends `class_cancelled` notifications, where before it only flipped
`classes.cancelled`.
**Files touched:**
- `src/server/routers/adminClasses.ts` — `cancel` now calls
  `cancelClass(ctx.db, input.id)` (the same service `classesRouter.cancel`
  already used, from CLASS-004) instead of its own inline `update`.
**Tests:** tRPC-caller-level verification via a temporary, untracked
script (`_tmp-e2e-test.ts`, deleted after use, never committed) — run
once against the unmodified code to reproduce CLASS-005, then again
after the fix to confirm it. Full detail in the CLASS-005 entry in
`known-issues.md`.

---

## 2026-08-15 — DOCUMENT(bookings): comment BOOK-DUP-001 (no uniqueness on active bookings)

**Type:** DOCUMENT
**Defect:** BOOK-DUP-001 (new — discovered while diagnosing the kiosk
showing "Advanced Spin" twice for Farhan Ahmed on 2026-08-15; see the
prior TEST entry above for how it was found)
**Behavior change:** no — comments only, no logic touched.
**Files touched:**
- `src/db/schema.ts` — inline comment on the `bookings` table, next to
  the existing `bookings_class_id_idx` index, noting there's no unique
  constraint (partial unique index on `(userId, classId) WHERE status IN
  ('booked','waitlisted')` would be the literal fix) stopping the same
  user from holding two simultaneous active bookings on one class.
- `src/server/routers/bookings.ts` — inline comment on `book`'s existing
  duplicate check (the `select ... where userId, classId, status in
  (booked, waitlisted) ... then insert` block), noting it's a
  check-then-insert race (app-level only, no DB backing) that also can't
  protect rows inserted outside this mutation — which is exactly how the
  seed data ended up with Farhan's two active bookings on class 849.
**Tests:** n/a — comment-only change.
**Scope note:** explicitly asked to add *only* these two inline
comments this round — no `known-issues.md` entry was added despite that
normally being this repo's required home for a DOCUMENT-type defect
(Rule 3/8). Flagging that gap here so it's visible rather than silently
missing if `known-issues.md` is audited later.

---

## 2026-08-15 — TEST(trainer/kiosk): end-to-end verification of roster check-in/admit and kiosk check-in

**Type:** TEST
**Defect:** n/a — verification of existing behavior, no code changed
**Behavior change:** no — no source file was edited in this entry. Only
the local dev DB (`flexfit.db`, gitignored) was touched, and only in
ways described below.

**What was verified, at the tRPC caller level (per Rule 6):**
Wrote a temporary, untracked script (`_tmp-e2e-test.ts`, deleted
immediately after the run — never committed) that built a real
`appRouter.createCaller(...)` context for a seeded trainer and a seeded
admin, then exercised the exact procedures the UI calls:
- `trainers.upcomingClasses` — confirms a trainer's own upcoming class
  is returned.
- `bookings.rosterFor` — confirms booked/waitlisted status is reported
  accurately per member.
- `bookings.markAttended` (source `"trainer"`) — confirms a booked
  member flips to `attended` and a `checkins` row is written.
- `bookings.admitFromWaitlist` — confirms a waitlisted member flips to
  `booked` and is charged the class's `creditCost`.
- A second `markAttended` call on an already-`attended` booking —
  confirms it's rejected `BAD_REQUEST`, "Only confirmed bookings can be
  checked in." (no silent success).
- `members.lookupByEmailOrPhone`, `bookings.upcomingForMember`, and
  `bookings.markAttended` (source `"kiosk"`) — the same three procedures
  `kiosk/page.tsx` calls, confirming the kiosk check-in flow independent
  of the trainer flow above.

All 16 assertions passed. The script created its own fully isolated temp
class + 3 temp bookings (using real seeded member/trainer users, but
brand-new class/booking rows) so it never touched the real seeded
"Sunrise Yoga" data — confirmed by re-querying class 850's bookings
inside the same script run and showing them unchanged. Every row the
script created (class, 3 bookings, 2 checkins) was deleted in a
`finally` block, verified empty afterward, and the script file itself
was deleted from the project root — `git status` shows a clean tree
before and after.

**Frontend wiring cross-check:** re-read `trainer/schedule/page.tsx`'s
`ClassCard` and `kiosk/page.tsx` line-by-line against the procedures/
input shapes exercised above — every `useQuery`/`useMutation` call
(`rosterFor({classId})`, `markAttended({bookingId, source})`,
`admitFromWaitlist({bookingId})`, `lookupByEmailOrPhone({query})`,
`upcomingForMember({userId, hoursAhead})`) matches exactly, so the UI is
wired to call the same procedures with the same shapes just verified at
the caller level. Also confirmed `/trainer/schedule`, `/kiosk`, and `/`
all render `200` server-side against the running dev server.

**Known limitation, stated explicitly rather than glossed over:** this
session has no browser-automation tool (no Playwright/Puppeteer
available), so I could not literally click "Check In"/"Admit" in a live
browser and watch the DOM update — the tRPC-caller tests above and the
static wiring cross-check are as close as this session can get without
one. A manual click-through in the browser is still the way to see the
actual UI states (button disable states, roster re-render, error card,
etc.) render live.

**Also this entry:** nudged the real "Sunrise Yoga" (class 850)
`startsAt` forward by 5 minutes (`2026-08-15T04:37:10.529Z`) — its
previous `startsAt` (set two turns ago so it'd be inside the check-in
window) had drifted into the past, which silently drops a class out of
`trainers.upcomingClasses`'s `startsAt >= now` filter even though
`markAttended`'s post-start check-in window would still accept it. Left
Meera Nair's waitlisted booking on that class untouched. This is local
dev-data only, done via another temporary, deleted script — no schema,
seed, or source file changed.

**Tests:** none added to the repo (no vitest config/test files exist on
this branch, consistent with every prior entry in this log) — this
entry's "test" is the temporary caller-level script described above,
by design not committed.

**Follow-up (same day):** the 5-minute nudge above was too tight — by
the time it was actually checked in a browser, real time had passed the
5-minute mark and the class had silently fallen out of
`trainers.upcomingClasses` again. Also confirmed via a temporary
diagnostic script that the seed data has no other classes at all for
this trainer on 2026-08-15 — every other class that day belongs to
2026-08-14 (already past) or 2026-08-16+ (later). Re-nudged class 850's
`startsAt` to `+25 minutes` from the fix (`2026-08-15T05:02:27.651Z`),
comfortably inside both the upcoming-classes filter and the 30-min
pre-start check-in window for the full buffer, not just ~1 minute of it.
Diagnostic and nudge scripts were both temporary and deleted immediately
after use, same as before.

---

## 2026-08-15 — CHORE(trainer): surface Check In/Admit mutation errors on the roster

**Type:** CHORE
**Defect:** n/a — UX gap found and fixed directly, not a behavior defect
**Behavior change:** yes, but display-only — no tRPC procedure, schema, or
business rule touched. `bookings.markAttended` already correctly rejects
a check-in outside its configured window (`BAD_REQUEST`, "Check-in is
only allowed from N minutes before class starts until it ends.") — that
rule is untouched. The bug was that `ClassCard` in
`trainer/schedule/page.tsx` never rendered any of its four mutations'
`error` (`markAttended`, `markCorpAttended`, `admitFromWaitlist`,
`admitCorpFromWaitlist`), so a legitimate server rejection looked
identical to the button silently doing nothing.
**Files touched:** `src/app/trainer/schedule/page.tsx` — added
`actionError` (first non-null error across the four mutations) and
render it as an inline panel above the Booked/Waitlist tabs, same
"show `mutation.error.message` in a panel" pattern already used in
`schedule/page.tsx` and `plans/page.tsx`. No other file touched.
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope (pure frontend error display). Verified:
`tsc --noEmit` clean (no errors, before or after).

---

## 2026-08-14 — CHORE(navbar): hide role-based links, bell, and profile name on the home page

**Type:** CHORE
**Defect:** n/a — UI request made directly by the user, not tied to a
known defect
**Behavior change:** yes, client-side only — on `/` (home) the navbar
now shows only the FlexFit logo and Sign in/Sign out, regardless of
role or login state. Every other route is byte-for-byte unchanged
(same role-based links, notification bell, profile-name link as
before). No tRPC procedure, query, or mutation touched — purely which
existing JSX blocks render, gated by the `isHome` flag `NavBar.tsx`
already computed for its transparent-over-hero styling.
**Files touched:** `src/components/NavBar.tsx` (wrapped the member/
trainer/admin link blocks, the notifications bell, and the profile-name
link in `!isHome &&`; header comment updated)
**Tests:** no tRPC procedure changed, nothing to characterize. Verified
live (Playwright, headless Chromium against the running dev server):
logged in as a seeded member, screenshotted the navbar on `/dashboard`
(unchanged — logo, My bookings/Schedule/Waitlist, bell, name, Sign out
all present) and on `/` (only logo + Sign out, everything else
correctly hidden). `tsc --noEmit` clean.

---

## 2026-08-13 — FIX(schedule): stop the Book/Join-waitlist button from getting clipped on a narrower window

**Type:** FIX
**Defect:** SCHED-003
**Behavior change:** yes, visual only — the spots-left/credit-cost
column and the Book/Join-waitlist button now have `shrink-0`, so only
the name/time column absorbs a narrower viewport by shrinking; the
button previously had no shrink protection and could get compressed
(and, combined with `body`'s `overflow-x: hidden`, silently clipped)
below its natural width. No click handler, mutation, or label text
touched.
**Files touched:** `src/app/schedule/page.tsx` (3 `shrink-0` additions:
the spots/credit column, the single-button path, the expanded-wrapper
path), `documents/known-issues.md` (added SCHED-003).
**Tests:** no tRPC procedure changed, nothing to characterize. Verified
live: screenshotted a class row at a 900px viewport before and after —
button visibly clipped before, renders fully after. `tsc --noEmit`
clean.

---

## 2026-08-13 — FIX(schedule): label the expanded book buttons "Join waitlist" for a full class

**Type:** FIX
**Defect:** SCHED-002
**Behavior change:** yes — for a company-linked member viewing a full
class, the expanded "Personal credits"/"{company} credits" buttons now
read "Join waitlist (personal)"/"Join waitlist ({company})" instead of
identical-to-normal wording. The collapsed single button (non-company
members) already said "Join waitlist" correctly and is unchanged; no
click handler or mutation touched — same `onBookPersonal`/`onBookCompany`
calls as before.
**Files touched:** `src/app/schedule/page.tsx` (`BookButton`'s two
expanded-state labels + its header comment), `documents/known-issues.md`
(added SCHED-002).
**Tests:** no tRPC procedure changed, nothing to characterize at the
caller level. Found and verified live: filled "Strength Basics" to
capacity via direct DB inserts, logged in as a company-linked seeded
member (Playwright against the running dev server), screenshotted the
expanded button before the fix ("Personal credits" / "TechCorp Inc
credits" — no waitlist indication) and after ("Join waitlist (personal)"
/ "Join waitlist (TechCorp Inc)"). `tsc --noEmit` clean.

---

## 2026-08-13 — FIX(schedule): surface booking-confirm errors inside the popup instead of hiding them behind it

**Type:** FIX
**Defect:** SCHED-001
**Behavior change:** yes — when a booking fails after clicking OK in the
confirm popup (e.g. `CONFLICT` for an already-booked class), the error
message now renders inside the still-open popup. Previously it only
rendered on the page behind the modal's overlay, invisible until the
popup was closed. Also resets the mutation's error state whenever the
popup opens/closes (`closeConfirm` now calls `book.reset()`/
`bookCorporate.reset()`), so a stale error can't leak into a differently
-targeted reopen — same shape as `RESCH-007`'s fix in
`reschedule-modal.tsx`. No tRPC procedure, error code, or error message
string changed.
**Files touched:**
- `src/components/booking-confirm-modal.tsx` — new `errorMessage` prop,
  rendered in the same red-text style `reschedule-modal.tsx` uses.
- `src/app/schedule/page.tsx` — passes `bookingError?.message` through;
  `closeConfirm` resets both mutations' error state.
- `documents/known-issues.md` — added SCHED-001.
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope. Found and verified by actually driving
the app — launched headless Chromium (Playwright) against the running
dev server, logged in as a real seeded member, and exercised the full
flow live rather than assuming it worked from reading the diff:
1. Picked a specific class instance confirmed via direct DB query to
   have zero prior bookings for the test account, so the happy path is
   provably clean.
2. Cancel → no booking, spots-left unchanged.
3. OK → booking succeeds, spots-left drops by exactly one, popup closes,
   booking appears on `/dashboard`.
4. Re-attempted booking the same class → `CONFLICT` as expected, and
   (this fix) the error is now visible inside the popup.
5. Repeated 2-3 for the corporate-credit path (a company-linked test
   account) — same result, correct "TechCorp Inc's pool" wording.
6. `tsc --noEmit` clean.

This is a genuine bug I introduced in the same session's earlier
"confirm popup before booking a class" CHORE — found by actually testing
the feature end-to-end rather than assuming it worked from the diff, per
the user's direct request to verify the pipeline.

---

## 2026-08-13 — CHORE(schedule): widen the expanded book-button row so longer company names don't clip

**Type:** CHORE
**Defect:** n/a — cosmetic, requested directly by the user
**Behavior change:** yes, visual only — the expanded Personal/Company
credits button row's `maxWidth` (a CSS transition target) went from
`260px` to `420px`, since `260px` was too narrow to fit "Personal
credits" + a longer company name like "TechCorp Inc credits" side by
side, clipping the second button's text. No logic, click handler, or
mutation touched.
**Files touched:** `src/app/schedule/page.tsx` (1 line)
**Tests:** no tRPC procedure touched, nothing to characterize. `tsc
--noEmit` clean; `git diff --stat` confirms only this 1-line change.

---

## 2026-08-13 — CHORE(schedule): confirm popup before booking a class

**Type:** CHORE
**Defect:** n/a — UX change requested directly by the user, not tied to
a known defect
**Behavior change:** yes, client-side only — clicking Book/Personal
credits/Company credits on `/schedule` now opens a confirmation popup
(class name, date/time, room, and how many credits will be deducted —
or the waitlist wording when the class is full, since waitlisted
bookings are always created with 0 credits used) instead of booking
immediately. `bookings.book`/`corporateBookings.book` are called with
identical inputs as before, just after Confirm is clicked instead of on
the button's own click — no tRPC procedure, schema, or error
handling changed.
**Files touched:**
- `src/components/booking-confirm-modal.tsx` (new) — reuses the same
  overlay/panel styling as `reschedule-modal.tsx` for visual
  consistency; works identically for both personal and corporate credit
  sources via a `source` prop.
- `src/app/schedule/page.tsx` — `BookButton`'s callbacks now open the
  popup (storing which class + credit source) instead of calling
  `book.mutate`/`bookCorporate.mutate` directly; the popup's own Confirm
  button is what actually fires the mutation. Everything else on the
  page (day filter, class list, spots-left/credit-cost display,
  sign-in redirect for logged-out visitors) is untouched.
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope. Verified manually: `tsc --noEmit`
clean; `git status --short` confirms only these 2 files touched.

---

## 2026-08-13 — FIX(auth): consistent client-side role gating across staff pages

**Type:** FIX
**Defect:** AUTH-004
**Behavior change:** yes, client-side presentation only — every one of
the 7 role-restricted pages listed below now shows one consistent
"Access denied"/"Please sign in" message, computed only after
`trpc.auth.me` actually settles. No tRPC procedure's input schema,
output shape, error code, or error message changed; the backend
(`adminProcedure`/`staffProcedure`, `src/server/trpc.ts`) was already the
real authorization boundary and remains completely unchanged — verified
by reading it directly before starting this fix.
**Files touched:**
- `src/components/require-role.tsx` (new) — `RequireRole`, the shared
  gate used by every page below instead of 4 different copy-pasted
  patterns.
- `src/app/admin/page.tsx` — previously had no client-side check at all
  (denied visitors saw `admin.stats`'s raw FORBIDDEN text).
- `src/app/admin/attendance/page.tsx`, `src/app/trainer/schedule/page.tsx`,
  `src/app/kiosk/page.tsx` — previously had a role check, but it ran
  before `auth.me` itself settled, so *legitimate* admins/trainers/staff
  also saw a false "Access denied" flash on every page load. Also fixes
  attendance's 3 data queries firing unconditionally for any visitor
  (plan.md #41's "unnecessary requests" complaint) — they're inside the
  now-gated child component, so they never mount for a denied visitor.
- `src/app/admin/reports/page.tsx`, `src/app/admin/companies/page.tsx`,
  `src/app/admin/companies/[id]/page.tsx` — previously had **no**
  client-side gating at all; a denied visitor saw a fully normal,
  interactive admin screen (companies list + create form, or the
  actively misleading "Company not found" on the detail page).
- `src/app/admin/announcements/page.tsx` — previously had no gating; the
  complete broadcast form (title, message, submit) rendered and was
  clickable for any visitor, only failing after submit.
- `documents/known-issues.md` — added AUTH-004 with the full per-page
  breakdown and the Rule 8 decision below.
**Rule 8 decision:** plan.md item #41 (and its system-wide duplicate,
item #11) only specifies the architecture direction (route groups, keep
tRPC as the real boundary) — it doesn't say whether a denied visitor
should see an inline message or be redirected. Chose inline message,
reusing the exact wording pattern `profile`/`dashboard` already used
correctly, as the smaller behavior change — no new client-side
navigation introduced anywhere. Full reasoning in known-issues.md's
AUTH-004 entry.
**Explicitly out of scope:** the fuller route-group restructuring
(`app/(member)/`, `app/(staff)/`, `app/(admin)/`) plan.md #41 also
suggests is a real file-move REFACTOR — Rule 3 forbids blending that
with this behavior FIX in one commit; left as a separate future
REFACTOR candidate. A stale comment in `trainers.ts` (claims a
trainer-only check where `staffProcedure` is actually used) was noticed
during this pass but is unrelated and untouched. The pre-existing `any`
types in `kiosk/page.tsx`/`companies/[id]/page.tsx` (plan.md #42) were
not introduced or expanded by this change and were left alone, same
precedent as KIOSK-001's fix.
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope. Verified manually: `tsc --noEmit`
clean across all 9 touched/new files; traced each page's render path by
hand against `RequireRole`'s implementation to confirm the denied state
now only renders after `auth.me` settles (no premature flash) and that
the wrapped content — including its data queries — never mounts for a
denied visitor, not merely stays visually hidden.

---

## 2026-08-13 — CHORE(dashboard): add a border around the membership cards

**Type:** CHORE
**Defect:** n/a — cosmetic, requested directly by the user
**Behavior change:** yes, visual only — wrapped the existing "Your
Membership" and "Corporate Membership" sections in one container `<div>`
with a border (`var(--border)`, matching the color already used
elsewhere for borders) and rounded corners. No content, spacing inside
each section, query, or logic touched — purely an outer wrapper.
**Files touched:** `src/app/dashboard/page.tsx` (2 lines: one opening
`<div>`, one closing `</div>`)
**Tests:** no tRPC procedure touched, nothing to characterize. `tsc
--noEmit` clean; confirmed via `git diff --stat` that only these 2 lines
changed.

---

## 2026-08-13 — FIX(dashboard): show corporate credit pool on the member dashboard

**Type:** FIX
**Defect:** COMPANY-002
**Behavior change:** yes — `/dashboard` now shows a "Corporate
Membership" card (company name, credit pool balance, Active status) for
a company-linked member, or "Not part of any corporate account" if not.
No tRPC procedure was touched — `corporateBookings.myCompany` is called
exactly as `/schedule` already calls it; only a new read and new JSX
were added.
**Files touched:**
- `src/app/dashboard/page.tsx` — added
  `trpc.corporateBookings.myCompany.useQuery()`; new section placed
  directly below "Your Membership", above "Upcoming bookings", styled to
  match the existing personal-membership card grid. Deliberately no
  "Renews on" row — `companies` has no renewal/expiry date field (see
  known-issues.md's data-model note); confirmed with the user rather
  than fabricating one.
- `documents/known-issues.md` — added COMPANY-002.
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope. Verified against the real dev database
directly (not just `seed.ts`'s intent) with a one-off script querying
`companyMembers`/`companies`: `rahul.k@example.com` → linked to
TechCorp Inc, balance 95 — matches what the new card renders.
`karthik.p@example.com` → not linked (seed only links the first 5 of 12
members) — matches the "Not part of any corporate account" empty state.
Script deleted after use, no DB rows modified. `tsc --noEmit` clean.

Closes known-issues.md's COMPANY-002. `corporateBookings.myCompany`,
`members.profile`, and every other query/mutation this page calls are
unchanged.

---

## 2026-08-13 — CHORE(docs): backfill 6 undocumented NavBar/plans commits (branch `member-page-updates` + `feature/password-visibility-toggle`)

**Type:** CHORE
**Defect:** n/a — these were all direct user-requested UI tweaks; no
`known-issues.md` defect ID applies to any of them
**Behavior change:** no — this entry only adds the log record Rule 7
required at commit time but didn't get. No code changes here.

The following 6 commits landed this session without an `EDIT_LOG.md`
entry and without the `<TYPE>(<area>): <summary>` message format Rule 8
requires. Backfilled here, same precedent as the 2026-08-09 AUTH-003
backfill entry above.

1. **`54c672e` — "feat: add show/hide toggle for password fields on
   login and signup"** (branch `feature/password-visibility-toggle`,
   merged via PR #30/`bbc843a`). Added a click-to-toggle eye icon on the
   password `<input>` in `src/app/login/page.tsx` and
   `src/app/signup/page.tsx` (local `showPassword` state, toggles
   `type="password"`/`type="text"`). No tRPC procedure touched — pure
   client state. **Files:** both password-field pages.

2. **`c50385a` — "fix: resolve leftover merge-conflict remnants in
   NavBar and plans page"**. A merge of `main` into `landing-page-one`
   (`e51f101`) had been resolved badly upstream, leaving duplicate JSX
   blocks, a duplicate `import`, and a mismatched closing brace committed
   directly to `main`. `src/components/NavBar.tsx`: removed the
   duplicated `navLinkClass`/Schedule-link/admin-hide-Home fragment
   stacked on top of the working `isHome`/`scrolled`/`logoClass` hero-nav
   code (this later turned out to have deleted a real feature — see
   entry 5 below, which restored it correctly). `src/app/plans/page.tsx`:
   fixed a missing `}` that broke the `.map((p) => { ... })` callback's
   closing (`))}`→ `);\n})}`), a straight syntax fix, no JSX content
   changed. **Behavior change:** unintentional regression (Schedule link
   lost), corrected in entry 5. **Files:** `NavBar.tsx`, `plans/page.tsx`.

3. **`9ee7a56` — "style: hover navbar links to neon green on non-home
   pages"**. One line: non-home nav links (`linkClass`) now
   `hover:text-green-400` instead of `hover:text-white`, matching the
   `--accent` neon-green already used elsewhere. **Files:** `NavBar.tsx`.

4. **`878b1dc` — "style: place notification badge inline next to bell
   icon"**. Replaced the 🔔 emoji with an outline SVG bell icon
   (`currentColor`), and changed the unread-count badge from an
   `absolute -right-2 -top-2` corner overlay (rendering incorrectly,
   wrapping to its own line) to a normal inline badge beside the icon
   (`inline-flex items-center gap-1.5`). **Files:** `NavBar.tsx`.

5. **`6fe17d2` — "style: reorder member nav links to My bookings,
   Schedule, Waitlist"** + the Schedule-link restoration that preceded
   it in the same conversation turn. Restored the member-only "Schedule"
   nav link (`/schedule`) that commit 2 above had accidentally deleted —
   confirmed via `git log -S` that it originated from a real, deliberate
   commit (`d5791a2` on `feature/ui-ux-polishes`, with its own
   logged-out/admin edge-case fixes) on a third branch that got tangled
   into the bad merge, not leftover noise. Scoped to **members only**
   (not trainers, who already have their own "My schedule" link) per
   explicit instruction, then reordered to My bookings → Schedule →
   Waitlist. Login's post-auth redirect to `/dashboard` for members was
   already correct (no change needed there). **Files:** `NavBar.tsx`.

6. **`4ec18ad` — "feat: highlight active navbar link in green"**.
   `linkClass` changed from a static string to a function taking a
   `path`, comparing it against `usePathname()` (exact match, or a
   `startsWith(path + "/")` prefix match for nested routes — same
   formula `d5791a2`'s original `navLinkClass` used) and returning
   `text-green-400 font-medium` when active, else falling back to the
   existing hero-aware styling. Applied to every nav link including the
   profile-name link. **Files:** `NavBar.tsx`.

**Tests:** none of the 6 touch a tRPC procedure, schema, or server route
— all client-side JSX/styling/state in `NavBar.tsx`, `login/page.tsx`,
`signup/page.tsx`, `plans/page.tsx`. Each was verified with `tsc --noEmit`
(clean) at the time and confirmed scoped via `git diff --stat` (each
commit touched only the file(s) listed above) before being committed.
No automated test harness exists in this branch for frontend-only
changes, consistent with every other frontend-only entry in this log.

**Process note going forward:** every commit from this point on will be
classified (REFACTOR/FIX/DOCUMENT/CHORE/TEST) and get its `EDIT_LOG.md`
entry in the same commit, per Rule 7 — this backfill should not need to
happen again.

---

## 2026-08-11 — CHORE(frontend): redesign landing page hero + navbar (branch `landing-page-one`)

**Type:** CHORE
**Defect:** n/a — visual redesign requested directly by the user, frontend-only
**Behavior change:** yes, but UI-only — no tRPC procedure, schema, or
server route was touched. All existing links/routes (`/schedule`,
`/plans`, `/signup`, `/login`) still exist and work; only the navbar's
*visible entry points* to them changed.
- `NavBar.tsx`: removed the "Schedule" link and the "Sign up" link
  (sign-up is still reachable from `/login`, unlinked from the bar only).
  On `/` only, the bar is now `fixed`/transparent over the hero image and
  flips to a solid white bar with black text past `scrollY > 40`
  (`usePathname`-gated so every other route's bar is byte-identical to
  before — still static, in-flow, dark, with "Schedule"/"Sign up" removed
  since those are shared across all routes).
- `src/app/page.tsx`: rebuilt as a full-bleed hero (100vw/100vh image
  background via a new original SVG asset, dark overlay for text
  contrast, existing headline/subtext/CTA buttons unchanged in content)
  followed by a full-bleed pure-white section reusing the exact same
  three studio cards (Studio A/B/Spin Room), restyled black-on-white with
  a small green accent dot. No content was added or removed, only
  re-laid-out, per the user's explicit "just rearrange" instruction. Uses
  the `left-1/2 w-screen -translate-x-1/2` full-bleed technique so
  `layout.tsx`'s shared `max-w-5xl`/`py-8` shell (used by every other
  route) did not need to change.
- `public/hero-bg.svg` (new): an original, code-generated dark/neon-green
  abstract background (gradient + ring/spotlight motif), used in place of
  a real gym photo — no photo asset was available in the repo and one
  wasn't fetched from the internet. Flagged to the user as swappable for
  a real photo later.
- Color theme: reused the existing `--accent: #4ade80` (already
  Tailwind's `green-400`, matching the requested neon-green-on-dark
  palette) — no `globals.css` changes were needed.
**Files touched:** `src/components/NavBar.tsx`, `src/app/page.tsx`,
`public/hero-bg.svg` (new)
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope (pure frontend/marketing page). Verified
manually: `tsc --noEmit` shows only the same pre-existing, unrelated
`auth.ts`/`corporate-bookings.ts` errors present before this change —
nothing new. Started the dev server on a spare port and confirmed via
curl that `/` renders 200 with the new hero/white-section content and
`hero-bg.svg` serves 200, and that "Schedule"/"Sign up" no longer appear
in the rendered navbar markup.

Scope: frontend-only per explicit user instruction; no backend, schema,
or other page was touched.

**Follow-up (same session):** the `w-screen` full-bleed technique used
above is `100vw`, which ignores the vertical scrollbar's own width and
pushed the page a few px past the viewport — Chrome on Windows then
showed a stray horizontal scrollbar (and, since that widened the
document, an extra sliver of vertical scroll). Fixed with one line,
`overflow-x: hidden` on `body` in `globals.css` — site-wide, but purely
clips horizontal overflow; vertical scrolling (needed to reach the white
section below the hero) is untouched. Verified: dev server on a spare
port, `curl localhost:3001/` → 200 after the change.

**Follow-up 2 (same session):** two more `src/app/page.tsx` tweaks, both
requested directly:
- Studio cards in the white section switched from a white/bordered card
  to a neon-green fill (`var(--accent)` background + a soft green glow
  shadow, brightening on hover) with black text; the small indicator dot
  changed from green to white so it still reads against the now-green
  card instead of disappearing into it.
- The section's heading/subtext (previously the hero's paragraph reused
  verbatim, per the prior follow-up) rewritten as its own short, distinct
  copy — same facts (three rooms, one class for every kind of day), new
  wording, so the white section doesn't just repeat the hero.
No tRPC/backend touched.

**Follow-up 3 (same session):** `src/app/schedule/page.tsx` — a signed-
out visitor's "Book"/"Join waitlist" button now redirects to `/login`
(`router.push`) on click, instead of just being disabled with a small
"Sign in to book a class" line as the only hint. Scoped entirely to this
one file: `BookButton` is a local, unexported function defined in
`schedule/page.tsx` only (confirmed via grep — no other file imports or
duplicates it), so this can't affect any other page. Signed-in behavior
(personal vs. company credits, full-class waitlisting, `bookings.book`/
`corporateBookings.book` themselves) is completely unchanged — only the
disabled-vs-clickable branching for `!user` changed. No tRPC procedure
touched. Verified: `tsc --noEmit` shows only the same pre-existing,
unrelated `auth.ts`/`corporate-bookings.ts` errors as every prior entry
in this log — nothing new.

**Follow-up 4 (same session):** `src/app/plans/page.tsx` — same fix as
Follow-up 3, applied to the "Sign in to subscribe" button: a signed-out
visitor clicking it now redirects to `/login` instead of doing nothing
(button was `disabled`). Scoped entirely to this one file — only the
button's `disabled`/`onClick` logic changed; `plans.subscribe` and the
signed-in Subscribe flow are untouched. No tRPC procedure touched.
Verified: `tsc --noEmit` shows only the same pre-existing, unrelated
errors as every prior entry in this log — nothing new.

**Follow-up 5 (same session):** `src/components/NavBar.tsx` — bumped the
"FlexFit." logo from the default (unset, ~1rem) size to `text-lg`, one
class added to the existing `logoClass` string. Purely cosmetic, no
other class/behavior touched.

**Incident (same session, self-inflicted, not a code defect):** while
verifying the scrollbar fix, a second `pnpm dev` was started in the
background (on a spare port) while the user's own `pnpm dev` was already
running on port 3000 — both processes wrote to the same `.next` build
cache concurrently, corrupting it (`route.js` manifest error, then
cascading 404s on `/login` in the user's live session). Fixed by deleting
the `.next` directory (safe, regenerated on next build — not source, not
touched otherwise) once confirmed no extra dev-server processes were
still running (`Get-NetTCPConnection` on ports 3000–3010 showed only the
user's original process). User needs to restart their own `pnpm dev` for
a clean rebuild. Lesson: never start a second `next dev` against a
directory that already has one running — reuse/observe the existing
server instead of spawning a parallel instance.

---

## 2026-08-09 — CHORE(docs): backfill AUTH-003 for the login role-redirect fix

**Type:** CHORE
**Defect:** AUTH-003
**Behavior change:** no — the code fix already exists on `development`
(commit `0b0ca11`, "fix: recover lost trainer improvements (redirects,
navbar, validation)"); this entry only adds the defect ID and log record
that commit should have carried under Rule 7/8 at the time but didn't.
**Files touched:**
- `documents/known-issues.md` — added AUTH-003 (login redirect was
  hardcoded to `/dashboard` for every role; commit `0b0ca11` made it
  role-aware: trainer → `/trainer/schedule`, admin → `/admin`, member →
  `/dashboard`).
**Tests:** none added — no code changed in this commit. Verified the
fix is actually present by reading `src/app/login/page.tsx` on
`development` directly (the three-way role branch and its inline
comment are already there). `tsc --noEmit` clean.
**Note:** commit `0b0ca11` also touched `NavBar.tsx` (plan.md #40,
role-based nav) and `trainers.ts` (a validation gap) — those are
separate, still-undocumented defects, deliberately not backfilled here
per Rule 4 (one defect per entry); they'll get their own entries if/when
picked up.
## 2026-08-08 — FIX(payments): refund cancels dependent bookings and promotes freed seats

**Type:** FIX
**Defect:** PAY-001
**Behavior change:** yes — `payments.refund` now cancels every `booked`/
`waitlisted` booking under the refunded membership (previously left
untouched), and promotes the next eligible waitlisted candidate for each
freed confirmed seat. Already-`attended` bookings and `creditsRemaining`
are unchanged. `refund`'s input schema, output shape, and error codes
are unchanged — same payment row returned, same `NOT_FOUND`/`BAD_REQUEST`
conditions as before.
**Files:** `src/server/routers/payments.ts` (`refund` gained a loop over
dependent bookings after cancelling the membership; reuses the existing
`promoteNextWaitlisted` from `src/features/bookings/waitlist-service.ts`
— no new promotion logic; file and procedure header comments updated)
**Policy:** cancel dependent bookings/waitlist, leave attended bookings
and credits alone — chosen explicitly with the user after plan.md
flagged this as a genuine ambiguity with no recommended default (same
shape as PLAN-001's decision). Full reasoning in
`architecture-decisions.md`'s 2026-08-08 entry.
**Tests:** no automated test harness in this branch — verified manually
against the dev server:
1. Refunded a seeded member's payment (`rahul.k@example.com`, ~50 active
   `booked`/`waitlisted` bookings, 8 already-`attended`).
2. `members.profile` → `membership: null` (correctly cancelled and no
   longer resolved as current).
3. All ~50 active bookings flipped to `cancelled`; `classesAttended`
   stayed at 8 — unchanged, since the fix's query only ever selects
   `status IN (booked, waitlisted)`, structurally excluding `attended`
   rows.
4. Manufactured a waitlisted booking for a second member on a class the
   refunded member was confirmed into; confirmed that candidate was
   promoted to `booked` by the refund's cancellation loop, the same way
   a normal `bookings.cancel` would promote them.
5. Test data reset afterward (`pnpm db:reset`) since the refund can't be
   reversed through any existing mutation.
Also ran `tsc --noEmit` and `next build` (both clean).

Closes known-issues.md's PAY-001 (plan.md item #22). `payments.markPaid`
is unrelated and untouched. Corporate bookings are untouched —
`payments.membershipId` never references a company, so there's nothing
corporate for a membership refund to reconcile.

---

## 2026-08-09 — FIX(kiosk): stop blocking check-in on zero credits

**Type:** FIX
**Defect:** KIOSK-001
**Behavior change:** yes — the kiosk's Check-in button no longer
disables when the member's current membership has zero credits
remaining; it now disables only on a pending mutation or an expired
membership. No tRPC procedure touched — `markAttended` already never
checked credits server-side (only booking status + check-in window), so
this only removes a client-side false block that didn't match what the
server actually allowed.
**Files touched:**
- `src/app/kiosk/page.tsx` — removed `hasNoCredits` from the Check-in
  button's `disabled` list; the "No credits remaining" banner stays but
  is now informational only. Updated the file header and banner comments
  to reflect the fix instead of describing it as open.
- `documents/known-issues.md` — added KIOSK-001 (new prefix, first
  kiosk-specific entry).
**Tests:** no tRPC procedure changed, so nothing to characterize at the
caller level per Rule 6's scope — verified by reading
`bookings.ts:markAttended` directly and confirming it never checked
credits (only `status === "booked"` and the check-in window), so the
client-side fix can't diverge from server behavior. `tsc --noEmit` shows
no new errors.
## 2026-08-09 — FIX(reschedule-modal): reset error/selection state on close and reselect

**Type:** FIX
**Defect:** RESCH-007
**Behavior change:** yes — the reschedule modal's `error` message (and
selected target class) now clears when the modal is closed via the
overlay or Cancel button, when a different target class is picked, and
after a successful reschedule. Previously `error` was only ever set, so
a failed attempt's message stayed visible on the next reopen until
overwritten. No tRPC procedure input/output/error shape touched — this
is local `useState` in a client component.
**Files touched:**
- `src/components/reschedule-modal.tsx` — added `handleClose()`
  (resets `selectedClassId` + `error`, then calls `onClose`), routed the
  overlay `onClick`, Cancel button, and mutation `onSuccess` through it;
  target-class selection now also clears `error`. Updated the file
  header and inline comments to reflect the fix instead of flagging it
  as open (was referencing plan.md item #38).
- `documents/known-issues.md` — added RESCH-007 entry.
**Tests:** no tRPC procedure is involved (pure frontend state), so
there's nothing to characterize at the caller level per Rule 6's scope.
No headless-browser tool was available this session to verify live the
way RESCH-005/RESCH-006 were — verified by tracing every `onClose`/
`onClick` path in the diff against the state-leak mechanism (component
stays mounted across `isOpen` toggles). `tsc --noEmit` and `next build`
both show only the same pre-existing, unrelated `auth.ts` and
`corporate-bookings.ts` errors present before this change — nothing new.

---

## 2026-08-09 — FIX(plans): make subscribe's insert atomic and its payment reference collision-resistant

**Type:** FIX
**Defect:** PLAN-002, PLAN-003
**Behavior change:** yes — `subscribe`'s membership insert and payment
insert now run inside one `ctx.db.transaction`, so a failure on either
side rolls both back instead of leaving an orphaned membership row.
Payment `reference` is now `PAY-<uuid>` (`crypto.randomUUID()`) instead
of `PAY-${Date.now()}`, so two subscriptions resolving in the same
millisecond no longer produce identical references. `plans.list`,
`create`, and `setActive` are unchanged; `subscribe`'s input schema,
success return shape, and existing `NOT_FOUND`/`BAD_REQUEST`/`CONFLICT`
errors are unchanged.
**Files touched:**
- `src/server/routers/plans.ts` — wrapped `subscribe`'s two inserts in a
  transaction, switched the payment reference to a UUID, updated the
  function's header comment to mark PLAN-002/PLAN-003 fixed instead of
  "not fixed here."
- `documents/known-issues.md` — marked PLAN-002 and PLAN-003 Fixed, kept
  the original problem description, recorded what changed.
**Tests:** no automated test harness exists anywhere in this repo
currently (no `.test.ts` files, no vitest config on this branch) —
manually verified against the dev server that `subscribe` still returns
the membership row and creates a matching payment on the happy path, and
that two back-to-back calls now produce distinct `PAY-<uuid>`
references. `tsc --noEmit` and `next build` both clean. This follows the
same manual-verification precedent already used for PLAN-001 and
PLAN-004 in this log.

---

## 2026-08-07 — FIX(admin): fix broadcast deactivated members and plan setActive errors

**Type:** FIX
**Defect:** NOTIF-001, PLAN-004
**Behavior change:** yes — `notifications.broadcast` now only sends notifications to active members (previously it sent to deactivated members too). `plans.setActive` now throws a `NOT_FOUND` error if the plan id does not exist (previously it silently returned undefined).
**Files touched:**
- `src/server/routers/notifications.ts` — updated `broadcast` filter to include `eq(users.active, true)`.
- `src/server/routers/plans.ts` — updated `setActive` to check if update returned a row, else throw `NOT_FOUND`.
**Tests:** no automated test harness (removed in prior refactor) — manually verified code changes.

---

## 2026-08-07 — FIX(db): add database indexes for schedule load performance

**Type:** FIX

**Defect ID:** n/a (Performance optimization)

**Behavior change:** yes — schedule page loading speed is drastically improved due to indexes on `bookings.classId` and `classes.startsAt`.

**Date:** 2026-08-07

**Files touched:**
- `src/db/schema.ts` — imported `index` and added indexes to `classes` and `bookings` tables.
- `documents/architecture-decisions.md` — logged the ADR for schema modification.
- `flexfit.db` — recreated/migrated database with new indexes.

**Tests added/updated:** n/a (Schema change, no business logic alteration).

**Summary:** The `classes.list` endpoint suffered from an O(N) table scan of the `bookings` table for every single class returned, causing severe latency on the `/schedule` page in development. Adding `bookings_class_id_idx` converts the subquery into a sub-millisecond lookup.

**AI tool note:** Authored with AI assistance.

---
## 2026-08-08 — FIX(memberships): getCurrentMembership rejects a not-yet-started membership

**Type:** FIX
**Defect:** MEMBER-006
**Behavior change:** yes — `getCurrentMembership` (used by both
`bookings.book` and `members.profile`) no longer treats a membership
with a future `startDate` as the caller's current one. No procedure's
input schema, output shape, or error codes changed — this only affects
*which row* is resolved as "current," same shape as the MEMBER-002 fix.
**Files:** `src/features/memberships/current-membership.ts`
(`getCurrentMembership`'s `where` clause gained `startDate <= today`;
docstring updated — the "not yet its own known-issues.md entry" note is
now resolved)
**Tests:** no automated test harness in this branch — verified manually
against the dev server, since no UI path can create a future-dated
membership:
1. Inserted a membership directly into the dev DB for a member with no
   other active membership: `startDate` 12 days in the future,
   `status: "active"`.
2. `members.profile` → `membership: null` (the future-dated row was not
   picked) — before this fix it would have been.
3. `bookings.book` → `FORBIDDEN`, "An active membership is required to
   book classes." — same rejection a member with no membership at all
   would get.
4. Regression check: a different member's normal, already-started
   active membership still resolved correctly on both `profile` and
   `bookings.book`.
5. Deleted the test membership row afterward.
Also ran `tsc --noEmit` and `next build` (both clean).

Closes known-issues.md's MEMBER-006 (plan.md item #21). `plans.subscribe`
itself is untouched — it still only ever creates memberships with
`startDate: today`, so this fix protects against future-dated rows
however they come to exist (direct DB access, or a future admin
membership-creation UI), rather than changing how memberships are
created today.

---

## 2026-08-08 — DOCUMENT(members): log MEMBER-006 (getCurrentMembership doesn't check startDate)

**Type:** DOCUMENT
**Defect:** MEMBER-006
**Behavior change:** no — nothing in the code changed for this entry.
**Files:** `documents/known-issues.md`
**Tests:** n/a

plan.md item #21 ("membership start date is not consistently
considered") was already referenced inline in `current-membership.ts`'s
docstring since the MEMBER-002 fix, but had no known-issues.md entry of
its own yet. Logged as **MEMBER-006** so the follow-up FIX has a defect
id to reference, per Rule 2's checklist and the same DOCUMENT-then-FIX
pattern used for MEMBER-005.

---

## 2026-08-08 — FIX(members): profile shows the member's actually-current membership

**Type:** FIX
**Defect:** MEMBER-002
**Behavior change:** yes — `members.profile`'s `membership` field is now
whichever row `getCurrentMembership` picks (`status: "active"` AND
`endDate >= today`), not just whichever row has the latest `endDate`.
Output *shape* is unchanged (same fields); only *which* membership row
gets returned changes, for accounts where those two definitions used to
disagree. `/dashboard` and `/profile` both render this field directly,
so both now display the same membership `bookings.book` would actually
charge against.
**Files:** `src/server/routers/members.ts` (`profile` now calls
`getCurrentMembership` first, then fetches the plan-joined row for that
specific membership id instead of its own broader query; file and
procedure header comments updated), `src/app/kiosk/page.tsx` (comment
only — corrected a reference that called its own, separate,
still-unfixed `memberships[0]` gap "the same ambiguity as MEMBER-002,"
which would now misleadingly imply that gap was also fixed)
**Tests:** no automated test harness in this branch — verified manually
against the dev server, reproducing the exact disagreement scenario:
1. `rahul.k@example.com`'s baseline: membership 1, `active`,
   `endDate: 2026-11-06`.
2. Refunded that payment as admin (`payments.refund`, unmodified) →
   membership 1 flipped to `status: "cancelled"`, `endDate` unchanged
   (still 2026-11-06, the later date).
3. `plans.subscribe`d to a shorter plan → membership 13, `active`,
   `endDate: 2026-09-07` (earlier than membership 1's).
4. `members.profile` → returned membership **13** (active, earlier
   endDate) — confirming the old "latest endDate wins" pick (which would
   have returned cancelled membership 1) no longer happens.
5. Cancelled and rebooked a class → the new booking's `membershipId` was
   **13**, matching what `profile` now shows — `bookings.book` and
   `profile` agree.
6. `/dashboard`, `/profile`, `/kiosk` all still render (200).
Also ran `tsc --noEmit` and `next build` (both clean). Test bookings
created during verification were cancelled afterward; seed data was not
otherwise altered (the refund/resubscribe was to a real seeded member,
left in its new state as a natural consequence of exercising unmodified
mutations, same as prior sessions' verification pattern).

Closes known-issues.md's MEMBER-002 (plan.md item #20). Depends on the
REFACTOR entry immediately below (`getCurrentMembership` extraction),
without which this commit would have had to duplicate the eligibility
query a third time. PLAN-001 (this member's active-membership subscribe
check) and MEMBER-001 (kiosk lookup ambiguity) are unrelated and
untouched. See `architecture-decisions.md`'s 2026-08-08 entry for the
full "why two commits, why this folder, what's out of scope" reasoning.

---

## 2026-08-08 — REFACTOR(bookings): extract activeMembershipFor into a shared getCurrentMembership

**Type:** REFACTOR
**Defect:** n/a (see the FIX(members) entry directly above — MEMBER-002)
**Behavior change:** no — `bookings.book`'s eligibility check is
byte-for-byte identical before and after; only the query's location
moved.
**Files:** `src/features/memberships/current-membership.ts` (new —
`getCurrentMembership(db, userId)`, the exact where-clause/orderBy
copied verbatim from `bookings.ts`'s private `activeMembershipFor`),
`src/server/routers/bookings.ts` (`activeMembershipFor` removed, its one
call site now calls the shared function; `desc` dropped from the
drizzle-orm import since it was only used by the removed function; file
header comment updated)
**Tests:** no automated test harness in this branch — verified by direct
comparison: the moved function's where clause (`userId` match, `status
= "active"`, `endDate >= today`) and `orderBy(desc(endDate))` tiebreak
are unchanged, just relocated. `tsc --noEmit` clean.

Sets up the shared resolver that `members.ts`'s `profile` switches to in
the FIX committed right after this one (see above) — done as a separate
REFACTOR-then-FIX pair per Rule 3, since this commit alone changes
nothing about what any procedure returns.

---

## 2026-08-08 — FIX(plans): reject subscribing while an active membership exists

**Type:** FIX
**Defect:** PLAN-001
**Behavior change:** yes — `plans.subscribe` now throws `CONFLICT`
("You already have an active membership. Wait for it to end before
subscribing again.") if the caller already has a `status: "active"`
membership, instead of silently inserting a second one. `plans.list`,
`create`, and `setActive` are unchanged.
**Files:** `src/server/routers/plans.ts` (`subscribe` gained an
existence check before the insert; file and procedure header comments
updated), `src/app/plans/page.tsx` (comment only — it already surfaces
`subscribe.error.message` in the UI, so no JSX/logic change was needed
for the new error to reach the member)
**Policy:** Reject was chosen explicitly with the user after plan.md
flagged this as a genuine ambiguity with no recommended default (unlike
COMPANY-001) — full reasoning in `architecture-decisions.md`'s
2026-08-08 entry.
**Tests:** no automated test harness in this branch — verified manually
against the dev server:
1. Logged in as a seeded member with an active membership (`rahul.k@example.com`)
   → `plans.subscribe` → `CONFLICT`, new message.
2. Refunded that member's payment as admin (`payments.refund`,
   unmodified) → their membership flipped to `status: "cancelled"`
   (existing, unmodified behavior).
3. `plans.subscribe` → succeeded, new `status: "active"` membership
   created.
4. `plans.subscribe` again immediately → `CONFLICT` again, confirming
   the check applies to the freshly-created membership too.
5. `/plans` still renders (200) with the fix in place.
Also ran `tsc --noEmit` and `next build` (both clean).

Closes known-issues.md's PLAN-001 (plan.md item #19/#4 depending on
numbering — "Users can create multiple simultaneous active
memberships"). PLAN-002 (non-atomic membership+payment insert) and
PLAN-003 (payment reference collisions) are unrelated and untouched.
Renewal/extension is explicitly out of scope for this fix — see the
"Named tradeoff" paragraph in `architecture-decisions.md`.
## 2026-08-08 — FIX(admin-companies): enforce one company per member

**Type:** FIX
**Defect:** COMPANY-001
**Behavior change:** yes — `adminCompanies.linkMember` now rejects
linking a member who is already linked to *any* company (previously
only rejected an exact duplicate of the same user+company pair). New
error message for the new case: `"This member is already linked to a
different company. Unlink them first."` The existing same-company
duplicate message is unchanged.
**Files:** `src/db/schema.ts` (`companyMembers.userId` now `.unique()`),
`src/server/routers/admin-companies.ts` (`linkMember`'s existence check
widened from "same user+company" to "any link for this user"; removed
the now-unused `and` import), `src/server/routers/corporate-bookings.ts`
(comments only — `getCompanyForMember` and the file header updated to
reflect that a user can no longer have more than one active-company
link; no query logic changed)
**Tests:** no automated test harness in this branch — verified manually
against the dev server:
1. Reset the dev DB (`pnpm db:reset`) to apply the new constraint —
   `drizzle-kit push` can't diff an in-place unique-constraint addition
   on an existing SQLite table (`LibsqlError: no such index:
   company_members_user_id_unique`, a drizzle-kit/libsql ordering bug,
   not an application issue); a fresh `CREATE TABLE` via reset sidesteps
   it. Confirmed seed data links no user to more than one company before
   resetting, so nothing was silently dropped.
2. `adminCompanies.linkMember` for a previously-unlinked member (id 10)
   to company 1 → succeeds.
3. Same member to company 2 → `CONFLICT`, new "different company"
   message.
4. Same member to company 1 again → `CONFLICT`, original "this company"
   message, unchanged.
5. Unlinked the test member afterward to restore clean seed state.
Also ran `tsc --noEmit` and `next build` (both clean).

Closes known-issues.md's COMPANY-001 (plan.md item #12). Full reasoning
for the schema change, and the drizzle-kit/libsql push quirk hit while
applying it, is in `architecture-decisions.md`'s 2026-08-08 entry.
`corporate-bookings.ts`'s `getCompanyForMember` query itself is
untouched — only the comment describing its now-resolved ambiguity
changed.

---

## 2026-08-08 — FIX(classes): stop leaking the class roster to unauthenticated callers

**Type:** FIX
**Defect:** CLASS-001
**Behavior change:** yes — `classes.byId` (renamed `classes.publicById`,
still `publicProcedure`) no longer returns a `roster` field at all; it
now returns the class row only. Previously anyone, signed in or not,
could call it and get every attendee's name and email for that class.
Confirmed `byId` had no frontend caller, so no UI is affected. Attendee
info is unaffected for its legitimate (staff) consumers —
`bookings.rosterFor` and `corporateBookings.rosterFor` (both
`staffProcedure`, both pre-existing, both unchanged) still return the
same data they always did.
**Files:** `src/server/routers/classes.ts` (`byId` → `publicById`,
roster query removed entirely; file header and the procedure's doc
comment updated)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server:
1. Called `classes.publicById` with no session cookie at all — response
   contained only class fields, no `roster` key anywhere.
2. Confirmed the old `classes.byId` path no longer resolves
   (`NOT_FOUND`, "No procedure found on path").
3. Confirmed `bookings.rosterFor` still returns full attendee
   names/emails for a staff (admin) caller, unchanged — and still
   correctly rejects an unauthenticated caller with
   `UNAUTHORIZED`/"Sign in required."
4. `tsc --noEmit` and `pnpm build` both clean.

No new `classes.rosterFor` was added — the staff-only roster capability
plan.md asks to "keep" already existed in `bookings.rosterFor`/
`corporateBookings.rosterFor`, in the exact shape needed; duplicating it
a third time would have worked against the brief's own "pull repeated
logic into one place instead of four."

Closes plan.md's member-flow item #15 ("classes.byId publicly exposes
the roster") and known-issues.md's CLASS-001.

---

## 2026-08-08 — FIX(classes): clean up all bookings, credits, and notifications when a class is cancelled

**Type:** FIX
**Defect:** CLASS-004
**Behavior change:** yes — cancelling a class now cancels every active
booking on it (personal AND corporate, `booked` AND `waitlisted`),
refunds credits for every one that had actually paid (unconditional
full refund, no free-cancellation-window check — see the Rule 8 note
below), and notifies every affected member. Previously only `booked`
personal bookings were cancelled, with no refund and no notification for
anyone. `classes.cancel`'s return shape changed — it now returns
`{ cls, summary }` instead of just the class row, per plan.md's
"structured cancellation summary" ask; `cancel` has no frontend caller
today, so nothing consumes the old shape.
**Files:** `src/features/bookings/class-cancellation-service.ts` (new —
`cancelClass`, all the actual cleanup logic, per Rule 7), `src/server/
routers/classes.ts` (`cancel` reduced to a thin wrapper; file header and
`cancel`'s doc comment updated to match), `documents/known-issues.md`
(CLASS-004 rewritten as fixed; NOTIF-003 and CORP-003's entries updated
— the latter's cross-reference to CLASS-004 was stale: cancelling a
class turns out not to need `promoteNextWaitlisted` at all, since the
whole waitlist is cancelled along with the class, unlike a reschedule or
a normal cancel which only ever free a single seat)
**Rule 8 decision (refund policy):** every cancelled `booked` booking
with `creditsUsed > 0` is refunded in full, unconditionally — no
`FREE_CANCELLATION_HOURS`/`CORPORATE_FREE_CANCELLATION_HOURS` window,
unlike member-initiated cancellation. Those windows discourage a member
from bailing late on their own choice; here the studio cancelled the
class, so there's no late-notice behavior to discourage. Confirmed with
the user before implementing — see `known-issues.md`'s CLASS-004 entry
for the full reasoning.
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded accounts, covering all
four combinations across two classes: a real personal `booked` booking
(real charge, refunded on cancel), a real corporate `booked` booking
(real charge to the company, refunded on cancel), a personal booking
that waitlisted once full (never charged, correctly just cancelled with
no refund needed), a corporate booking that waitlisted once full (same),
and an unlimited-plan personal booking (never actually decremented,
correctly left alone). Cancelling both test classes confirmed: all 5
bookings flipped to `cancelled` including the 2 that were `waitlisted`
(untouched before this fix); the personal membership and company credit
pool were refunded to their exact pre-test values; the unlimited
membership was untouched; and all 5 affected members got a
`class_cancelled` notification, including the 2 who were only ever
waitlisted (none before this fix). `tsc --noEmit` and `pnpm build` both
clean.

Closes plan.md's member-flow item #14 ("Class cancellation doesn't clean
up member bookings properly") and known-issues.md's CLASS-004.

---

## 2026-08-07 — FIX(reschedules): reject rescheduling to a class with a different credit cost

**Type:** FIX
**Defect:** RESCH-004
**Behavior change:** yes — rescheduling to a same-named class whose
`creditCost` differs from the original's is now rejected outright
(`BAD_REQUEST`, "You can only reschedule to a class with the same
credit cost.") instead of silently carrying the original's stale
`creditsUsed` forward. Rescheduling between same-named classes with
*equal* cost is completely unaffected — same behavior as before, for all
four transitions. No other tRPC procedure's input, output shape, or
error codes/messages changed.
**Files:** `src/server/routers/reschedules.ts` (`reschedule`: one new
check, placed right after the existing "same name" check, before any
transition-specific logic runs; `validateReschedule`: identical check,
so the preview agrees with the mutation; file header and both
procedures' JSDoc updated)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with a real seeded membership:
1. Case A (mismatched cost): booked a 5-credit class, attempted to
   reschedule to a same-named 8-credit class → both
   `validateReschedule` (`valid: false`) and `reschedule`
   (`BAD_REQUEST`) correctly rejected it, with the original booking
   completely untouched.
2. Case B (matching cost): booked a 5-credit class, rescheduled to a
   same-named 5-credit class → succeeded exactly as before
   (`booked → booked`, `creditsUsed: 5` carried forward) — confirms the
   new check doesn't regress the common case.
3. All test classes/bookings/reschedule records deleted afterward; the
   member's membership restored to its exact pre-test value (10
   credits).
4. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #13 ("Reschedule preserves the wrong
credit cost") and known-issues.md's RESCH-004 — the last of the four
RESCH defects in `reschedules.ts` (RESCH-001/002/003 fixed in prior
commits on this branch lineage); that file is now fully closed out
against known-issues.md.

---

## 2026-08-07 — FIX(reschedules): promote the original class's waitlist after a confirmed reschedule

**Type:** FIX
**Defect:** RESCH-003
**Behavior change:** yes — rescheduling away from a class you were
`booked` into now promotes that class's own waitlist (same shared logic
`bookings.ts`'s/`corporate-bookings.ts`'s `cancel` already use) after the
original booking is cancelled, instead of leaving the freed seat
unclaimed and anyone waitlisted there stuck indefinitely. Rescheduling
away from a `waitlisted` original still triggers no promotion (correct
— no seat was held to free). No tRPC procedure's input, output shape,
or error codes/messages changed; no change to the promotion mechanics
themselves.
**Files:** `src/server/routers/reschedules.ts` (`reschedule`: added one
call to the existing, already-fixed `promoteNextWaitlisted`
(`src/features/bookings/waitlist-service.ts`) right after the original
booking is cancelled, guarded by `status === "booked"`; file header and
the mutation's JSDoc updated)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded accounts:
1. Filled a capacity-1 class with one member (real confirmed booking,
   real charge) and had a second member join its waitlist.
2. Rescheduled the first member away to a different, same-named class →
   the reschedule itself succeeded normally (new booking `booked`, same
   `creditsUsed` — a `booked → booked` transition, untouched by
   RESCH-001/002).
3. Confirmed the waitlisted member on the *original* class was
   correctly promoted: `bookings.mine` showed `status: "booked"`,
   `creditsUsed` matching the class's cost, and a real
   `waitlist_promotion` notification was created — none of which
   happened before this fix.
4. All test classes/bookings/reschedule records/notifications deleted
   afterward; the rescheduling member's membership restored to its
   exact pre-test value (10 credits); the promoted member's unlimited
   membership confirmed untouched.
5. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #12 ("Reschedule never promotes the
old class's waitlist after freeing a seat") and known-issues.md's
RESCH-003 — see that entry for what's still explicitly out of scope
(RESCH-004, a separate defect ID, untouched by this commit).

---

## 2026-08-07 — FIX(reschedules): refund credits when a confirmed reschedule becomes waitlisted

**Type:** FIX
**Defect:** RESCH-002
**Behavior change:** yes — rescheduling a paid (confirmed) booking into
a class that's full now creates the new waitlisted booking with
`creditsUsed: 0` (matching every other waitlisted booking in the app)
and refunds the original's already-deducted credits back to the
membership, instead of silently carrying the nonzero charge forward. A
later promotion of that booking (via the already-fixed BOOK-004 path)
now charges exactly once instead of twice. No tRPC procedure's input,
output shape, or error codes/messages changed. The `booked→booked` and
`waitlisted→waitlisted` transitions are byte-for-byte unchanged — this
is the mirror-image fix to RESCH-001's `waitlisted→confirmed` case,
same file, same invariant, opposite direction.
**Files:** `src/server/routers/reschedules.ts` (`reschedule`: added a
`becomingWaitlisted` branch that zeroes the new booking's `creditsUsed`
and refunds the original's `creditsUsed` to the membership, using the
same `membership`/`UNLIMITED_CREDITS` handling already in place for
RESCH-001; file header and the mutation's JSDoc updated; no change to
`validateReschedule` — this transition was never rejected, only
mis-accounted, so the preview needed no new check)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with a real seeded membership:
1. Booked a class for real (rahul's membership: 10 → 4, a genuine
   6-credit charge).
2. Rescheduled that confirmed booking into a same-named, capacity-1
   class that was already full → the new booking came back
   `status: "waitlisted"`, `creditsUsed: 0` (not the stale 6), and the
   membership was correctly refunded back to 10.
3. Cancelled the booking occupying that full class, triggering
   promotion (BOOK-004's shared `tryPromotePersonalCandidate`) → the
   waitlisted booking was promoted to `status: "booked"`,
   `creditsUsed: 6`, and the membership ended at exactly 4 — charged
   once for the one continuous booking, not twice.
4. All test classes/bookings/reschedule records deleted afterward;
   rahul's membership restored to its exact pre-test value (10
   credits); vikram's unlimited membership (999) confirmed untouched.
5. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #11 ("Reschedule to a full class can
double-charge") and known-issues.md's RESCH-002 — see that entry for
what's still explicitly out of scope (RESCH-003/RESCH-004, both separate
defect IDs, both untouched by this commit).

---

## 2026-08-07 — FIX(reschedules): charge credits when a waitlisted reschedule becomes confirmed

**Type:** FIX
**Defect:** RESCH-001
**Behavior change:** yes — rescheduling a waitlisted (0-credit) booking
into a class that isn't full now charges the target class's `creditCost`
against the member's membership (rejecting with `FORBIDDEN`/"Not enough
class credits remaining." if they can't afford it) instead of silently
creating a confirmed, unpaid booking. Every other reschedule transition
(booked→booked, booked→waitlisted, waitlisted→waitlisted) is byte-for-
byte unchanged — none of them had this bug. No tRPC procedure's input,
output shape, or other error codes/messages changed.
**Files:** `src/server/routers/reschedules.ts` (`reschedule`: added a
credit check + real charge for the waitlisted→confirmed transition only,
using the booking's existing `membershipId` and the target class's
`creditCost`; `validateReschedule`: mirrored the same check so the
preview and the mutation agree; file header and both procedures'
comments updated)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with a real seeded membership:
1. Case A (enough credits): rahul (10 credits) joined a capacity-1
   class's waitlist (booking created with `creditsUsed: 0`, as always).
   Rescheduled to a same-named, non-full class costing 5 credits →
   `validateReschedule` previewed valid, the mutation returned the new
   booking as `status: "booked"`, `creditsUsed: 5` (not the old stale
   0), and rahul's membership correctly dropped to 5.
2. Case B (insufficient credits): same setup, but rahul's membership was
   drained to 0 credits first via a second real booking. Rescheduling
   into a class costing 8 → `validateReschedule` returned
   `valid: false`/"Not enough class credits remaining.", and the mutation
   threw the identical `FORBIDDEN` error. The original waitlisted
   booking was untouched, no new booking was created, and the membership
   balance stayed at 0.
3. All test classes/bookings/reschedule records deleted afterward;
   rahul's membership restored to its exact pre-test value (10 credits).
4. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #10 ("Reschedule from a waitlisted
booking creates a free confirmed booking") and known-issues.md's
RESCH-001 — see that entry for what's still explicitly out of scope
(RESCH-002/003/004, all separate defect IDs, all untouched by this
commit).

---

## 2026-08-07 — FIX(bookings): verify membership credit before promoting a personal waitlist candidate

**Type:** FIX
**Defect:** BOOK-004
**Behavior change:** yes — a personal waitlist candidate whose membership
can no longer afford the class is now correctly skipped (stays
waitlisted, no charge, no confirmation) instead of being wrongly
confirmed as `booked` with the deduction floored at zero via
`Math.max(0, ...)`. The next-oldest eligible candidate (personal or
corporate) is promoted instead of nobody. No tRPC procedure's input,
output shape, or error codes/messages changed. A booking with no
`membershipId`, or one whose membership row can no longer be found, is
still treated as eligible, exactly as before — that narrower edge case
is out of scope for this defect.
**Files:** `src/features/bookings/waitlist-service.ts`
(`promotePersonalCandidate` renamed to `tryPromotePersonalCandidate` and
rewritten to verify `creditsRemaining` before promoting, mirroring
`tryPromoteCorporateCandidate`'s shape exactly; the main loop in
`promoteNextWaitlisted` made symmetric between the two sources), `src/
server/routers/bookings.ts` and `src/server/routers/corporate-bookings.ts`
(comments only, describing the now-fully-fixed promotion behavior)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded accounts, mirroring
CORP-001's exact test with roles swapped:
1. Capacity-1 class (cost 9). Filled personally. A personal candidate
   (rahul, limited membership) joined the waitlist while their
   membership could afford it (10 credits).
2. Rahul's membership was then spent down to 1 credit via a second,
   real personal booking on an unrelated class — so by promotion time,
   rahul could no longer afford the 9-credit class.
3. A corporate candidate (meera, TechCorp) joined the same waitlist
   afterward (newer than rahul).
4. Cancelled the confirmed booking → rahul was correctly **skipped**
   (`bookings.mine` still showed `status: "waitlisted"`, no
   notification sent to him, his membership balance stayed at 1 — not
   further deducted for a booking that didn't happen), and meera was
   correctly promoted instead (`status: "booked"`, correct credit
   deduction from TechCorp, got the `waitlist_promotion` notification).
5. All test classes/bookings/notifications deleted afterward; rahul's
   membership and TechCorp's balance restored to their exact pre-test
   values (10 and 98).
6. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #9 ("Normal waitlist promotion can
overdraw a membership") and known-issues.md's BOOK-004 — see that entry
for the Rule 8 policy decision (skip-and-try-next, reused verbatim from
CORP-001 rather than re-decided, and why) and for what's still
explicitly out of scope (the missing-membershipId edge case, and the
broader check-then-write transactional gap shared with every other
booking flow).

---

## 2026-08-07 — FIX(bookings): verify company credit before promoting a corporate waitlist candidate

**Type:** FIX
**Defect:** CORP-001
**Behavior change:** yes — a corporate waitlist candidate whose company
can no longer afford the class is now correctly skipped (stays
waitlisted, no charge, no confirmation) instead of being wrongly
confirmed as `booked` with the deduction silently omitted. The next-
oldest eligible candidate (personal or corporate) is promoted instead of
nobody. No tRPC procedure's input, output shape, or error codes/messages
changed. BOOK-004 (personal promotion's own missing credit check) is
untouched — a personal candidate is still promoted unconditionally.
**Files:** `src/features/bookings/waitlist-service.ts`
(`promoteNextWaitlisted` rewritten from "peek one candidate per table,
pick the older" to "merge all waitlisted candidates from both tables
into one chronological queue, walk it, skip an ineligible corporate
candidate and continue" — split into two new helpers,
`promotePersonalCandidate`/`tryPromoteCorporateCandidate`, for
readability), `src/server/routers/bookings.ts` and
`src/server/routers/corporate-bookings.ts` (comments only, describing
the new behavior)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded, company-linked accounts:
1. Capacity-1 class (cost 10). Filled personally. A corporate candidate
   (meera, TechCorp) joined the waitlist while TechCorp could afford it
   (balance 98).
2. TechCorp's balance was then spent down to 8 via a second, real
   corporate booking on an unrelated class — so by promotion time,
   meera's company could no longer afford the 10-credit class.
3. A personal candidate (vikram) joined the same waitlist afterward
   (newer than meera).
4. Cancelled the confirmed booking → meera was correctly **skipped**
   (`corporateBookings.mine` still showed `status: "waitlisted"`, no
   notification sent to her, TechCorp's balance stayed at 8 — not
   further deducted for a booking that didn't happen), and vikram was
   correctly promoted instead (`status: "booked"`, got the
   `waitlist_promotion` notification).
5. All test classes/bookings/notifications deleted afterward; TechCorp's
   balance restored to its exact pre-test value (98).
6. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's member-flow item #8 ("Corporate waitlist promotion can
create a free booking") and known-issues.md's CORP-001 — see that entry
for the Rule 8 policy decision (skip-and-try-next, chosen explicitly
over stop-and-leave-waitlisted, and why) and for what's still explicitly
out of scope (BOOK-004, the transactional/atomicity gap).

---

## 2026-08-07 — FIX(bookings): unify normal and corporate waitlist promotion

**Type:** FIX
**Defect:** CORP-003
**Behavior change:** yes — when a confirmed booking is cancelled (personal
or corporate), the class's waitlist is now promoted from whichever
candidate has *genuinely* waited longest across both `bookings` and
`corporateBookings`, not just whichever table the cancellation happened
to come from. No tRPC procedure's input, output shape, or error
codes/messages changed. BOOK-004 and CORP-001 (the promotion mechanics'
own separate, already-documented bugs) are preserved byte-for-byte —
only candidate *selection* changed.
**Files:** `src/features/bookings/waitlist-service.ts` (new —
`promoteNextWaitlisted`, shared by both call sites below),
`src/server/routers/bookings.ts` (`cancel`'s ~50-line inline promotion
block replaced with one call), `src/server/routers/corporate-bookings.ts`
(same, and the now-unused `notifications` import removed)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded, company-linked accounts
(TechCorp Inc / rahul.k, meera.n, vikram.s), both directions:
1. Capacity-1 class filled by a personal booking. Queued a *corporate*
   waitlist candidate, then — after a real ~10s gap — a *newer personal*
   candidate. Cancelled the personal booking → the older *corporate*
   candidate was correctly promoted (status: booked), the newer personal
   one correctly stayed waitlisted, and the promoted member received the
   existing `waitlist_promotion` notification (NOTIF-002).
2. Mirror case on a second class: filled by a corporate booking, older
   *personal* candidate queued first, newer corporate candidate second.
   Cancelled the corporate booking → the older *personal* candidate was
   correctly promoted, the newer corporate one correctly stayed
   waitlisted.
3. All test classes/bookings/notifications deleted afterward; TechCorp's
   credit pool balance restored to its pre-test value.
4. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's critical-problems item #2 ("Waitlists don't coordinate")
and known-issues.md's CORP-003 — see that entry for exactly which
adjacent gaps (BOOK-004, CORP-001, transactional promotion, RESCH-003,
CLASS-004) are explicitly still open and why. CORP-001's and BOOK-004's
own known-issues.md entries updated to point at the promotion logic's
new location (`waitlist-service.ts`), since the bugs themselves moved
with it unchanged. New file follows the same `src/features/bookings/`
home CORP-002's `capacity-service.ts` established in the previous commit.

---

## 2026-08-07 — FIX(bookings): count both personal and corporate bookings toward class capacity

**Type:** FIX
**Defect:** CORP-002
**Behavior change:** yes — a class already at capacity from one booking
source (personal or corporate) now correctly waitlists a booking or
reschedule attempted from the *other* source, instead of wrongly
confirming it and exceeding capacity. No tRPC procedure's input, output
shape, or error codes/messages changed — only the truth value feeding
the existing booked-vs-waitlisted branching.
**Files:** `src/features/bookings/capacity-service.ts` (new —
`getConfirmedOccupancy`/`isClassFull`, shared by all four call sites
below), `src/server/routers/bookings.ts` (`book`'s `isFull` check),
`src/server/routers/corporate-bookings.ts` (`book`'s `isFull` check, and
the now-unused `sql` import removed), `src/server/routers/reschedules.ts`
(`reschedule` and `validateReschedule`'s `targetIsFull` checks)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server with real seeded, company-linked accounts
(TechCorp Inc / rahul.k, meera.n, vikram.s):
1. Capacity-1 class, personal booking fills it → corporate booking on
   the same class → `status: "waitlisted"`, `creditsUsed: 0` (previously
   would have wrongly confirmed with `creditsUsed: 1`).
2. Same test, reversed: corporate fills → personal booking → correctly
   waitlisted.
3. Reschedule: booked a source class personally, filled a same-named
   target class (capacity 1) via a corporate booking, then rescheduled
   into it → `validateReschedule` preview correctly showed
   `targetIsFull: true`, and the actual `reschedule` mutation correctly
   returned `newStatus: "waitlisted"`, matching the preview.
4. All test classes/bookings deleted afterward; membership credit
   balances and the TechCorp credit pool restored to their pre-test
   values.
5. `tsc --noEmit` and `pnpm build` both clean.

Closes plan.md's critical-problems item #1 ("Class capacity can be
exceeded") and known-issues.md's CORP-002 — see that entry for exactly
which related gaps (schedule display's spotsLeft, ADMIN-001, trainer
roster, the check-then-insert race) are explicitly still open and why.
New file `src/features/bookings/capacity-service.ts` follows
AGENT_RULES.md Rule 7's own literal filename example; reasoning for
introducing `src/features/` now (scoped to just this one extraction, not
a general router rewrite) recorded in `architecture-decisions.md`.

---

## 2026-08-07 — FIX(reschedule-modal): stop the infinite refetch loop in the class picker

**Type:** FIX
**Defect:** RESCH-006
**Behavior change:** yes — the reschedule picker now actually loads and
displays classes; before this fix it never resolved data in the browser
at all (permanently stuck on "No other classes available"). No tRPC
procedure changed — `classes.list` is called exactly as before, just
with a stable `from` value instead of a fresh one every render.
**Files:** `src/components/reschedule-modal.tsx` (`from` computed via
`useMemo(() => new Date().toISOString(), [isOpen])` instead of inline
`new Date().toISOString()` on every render)
**Tests:** no automated test harness in this branch — verified live via
Playwright/Chromium (the same session that discovered the bug):
1. Reopened the "Sunrise Yoga" reschedule modal for the same real
   booking used to discover RESCH-006.
2. Polled the `classes.list` request count every 300ms for 6 seconds:
   steady at 1, not climbing (was 200+ and still climbing).
3. Picker rendered all 8 other real "Sunrise Yoga" instances and
   correctly excluded the original (Sat 8 Aug) — confirming RESCH-005
   alongside this fix, screenshotted as evidence.
4. Zero browser console errors.
5. `tsc --noEmit` and `pnpm build` both clean.

Requested explicitly as an immediate follow-up to the previous entry's
discovery, fixed in this separate commit (not amended into RESCH-005's
commit) per Rule 4 — one defect, one commit — even though both landed on
the same branch back to back.

---

## 2026-08-07 — DOCUMENT(reschedule-modal): log a newly-discovered infinite-refetch-loop bug

**Type:** DOCUMENT
**Defect:** RESCH-006
**Behavior change:** no — nothing in the code changed for this entry.
**Tests:** n/a

While verifying RESCH-006's sibling fix (RESCH-005, next entry) in a
real browser, discovered that `reschedule-modal.tsx`'s `classes.list`
query never actually resolves usable data — `from: new
Date().toISOString()` is computed inline on every render, producing a
new query key every time, which triggers an infinite fetch/re-render
loop (reproduced: 200+ requests in 6 seconds, climbing with no sign of
stopping). The picker shows "No other X classes available" permanently,
regardless of what data actually exists. Confirmed via `git stash`
against the unmodified code that this predates today's session entirely
— not introduced by RESCH-005. Logged in `known-issues.md` with full
repro details rather than silently fixed alongside RESCH-005 (Rule 4 —
one defect per commit) or left undocumented.

---

## 2026-08-07 — FIX(reschedule-modal): exclude the original class from the reschedule picker

**Type:** FIX
**Defect:** RESCH-005
**Behavior change:** yes — the class the member is already booked into no
longer appears as a pickable target in the reschedule modal. No tRPC
procedure changed; `reschedules.reschedule` is called exactly as before.
**Files:** `src/components/reschedule-modal.tsx` (new `fromClassId` prop,
`sameNameClasses` filter now also excludes it), `src/app/dashboard/page.tsx`
(the only call site — `rescheduleModal` state gained `classId`, sourced
from `bookings.mine`'s existing `classId` field, no new fetch)
**Tests:** no automated test harness in this branch — verified two ways:
1. Live in a headless Chromium session (Playwright): logged in as
   rahul.k@example.com, opened the reschedule modal for a real "Sunrise
   Yoga" booking. Blocked by RESCH-006 (see previous entry) from
   observing the picker's actual rendered list, since it never resolves
   in the browser regardless of this fix — documented there rather than
   claimed as a false pass here.
2. Direct data-level check: fetched real `classes.list` output (9
   "Sunrise Yoga" instances) and applied the exact filter expression used
   in the component with `fromClassId: 700` (the real original booking's
   class) — confirmed id `700` is excluded and the other 8 instances are
   not.
Also ran `tsc --noEmit` and `pnpm build` (clean).

Closes plan.md's member-flow item #5 ("Reschedule modal doesn't truly
exclude the current class from the picker") and known-issues.md's
RESCH-005. Deliberately scoped to just this: RESCH-006 (found during
verification) and plan.md item #38 (stale error state, a separate,
already-known gap in this same file) are both left untouched.

---

## 2026-08-07 — FIX(members): add profile-edit UI

**Type:** FIX
**Defect:** MEMBER-004
**Behavior change:** yes — a new route (`/profile`) now exists and is
reachable from `NavBar` (clicking your own name). No existing route,
procedure input/output, error code, or error message changed;
`members.profile` and `members.updateProfile` were called exactly as
they already existed, not modified.
**Files:** `src/app/profile/page.tsx` (new), `src/components/NavBar.tsx`
(the plain `{user.name}` text is now a link to `/profile`)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server:
1. `members.profile` before → baseline name/phone recorded.
2. `members.updateProfile` with a new name/phone → 200, row updated.
3. `members.profile` after → reflects the new values.
4. `auth.me` after → also reflects the new name, confirming the
   NavBar-visible name updates too (NavBar reads `auth.me`, not
   `members.profile`, hence invalidating both on save).
5. `members.updateProfile` with `phone: null` → phone cleared correctly.
6. Restored the test account's original name/phone afterward so
   `flexfit.db` is unpolluted.
Also ran `tsc --noEmit` and `pnpm build` (clean, `/profile` compiles as
a static route).

Closes plan.md's member-flow item #4 ("No profile-edit UI — mutation
exists, no form") and known-issues.md's MEMBER-004. `updateProfile` was
read closely before building on top of it — confirmed it only accepts
name/phone, so no email/password editing was added (that capability
doesn't exist server-side, and inventing it wasn't asked for or in
scope). No other files were touched.

---

## 2026-08-07 — FIX(notifications): send membership-expiring reminders via a real daily cron

**Type:** FIX
**Defect:** NOTIF-004
**Behavior change:** yes — a new standalone background process (`pnpm
cron`) inserts `membership_expiring` notifications once daily; a new
admin-only mutation and button let staff trigger the same job on demand.
No existing procedure's input/output/error shape changed.
**Files:** `src/server/jobs/membership-expiry.ts` (new — the shared job
function), `src/server/cron.ts` (new — standalone process that schedules
it via `node-cron` at 08:00 daily), `src/server/routers/admin.ts` (new
`runMembershipExpiryCheck` mutation, reuses the same function),
`src/app/admin/reports/page.tsx` (new "Send expiry reminders now"
button), `src/server/routers/notifications.ts` and
`src/app/notifications/page.tsx` (header comments corrected — no longer
claim this type is never inserted), `package.json`/`pnpm-lock.yaml`
(added `node-cron`, new `pnpm cron` script)

**Discovered and reverted mid-fix:** the first version of this scheduled
the job from `src/instrumentation.ts` (Next's server-startup hook), which
seemed like the more idiomatic choice. It was wrong: Next's dev-mode
webpack also compiles `instrumentation.ts` for the edge runtime, and
`node-cron`'s internal `node:crypto` import isn't handled there — the
failure wasn't a harmless log line, it 500'd unrelated API routes
(`auth.login` included) during manual verification. Adding `node-cron` to
`serverExternalPackages` in `next.config.mjs` (the standard fix for this
class of problem, already used for `@libsql/client`) didn't resolve it,
since that only covers the nodejs bundle target, not the edge one Next
separately builds for `instrumentation.ts`. Deleted `instrumentation.ts`
and moved the schedule into `server/cron.ts`, a plain script run via
`tsx` outside Next's build entirely — confirmed clean afterward.

**Tests:** no automated test harness in this branch — verified manually:
1. Seeded a membership with `endDate` inside the 14-day window (already
   present via seed data / `admin.expiringMemberships`).
2. Called `admin.runMembershipExpiryCheck` directly against the running
   dev server → returned `{notified: N}` matching
   `expiringMemberships`'s count.
3. Queried that member's `notifications.list` → new `membership_expiring`
   row present with the correct plan name and expiry date.
4. Ran `pnpm cron` standalone → confirmed the "job scheduled" log line
   and no errors, independent of `pnpm dev`.
5. `tsc --noEmit` and `pnpm build` both clean; `pnpm dev` no longer shows
   the `node:crypto` error and ordinary requests (`auth.login` etc.) work
   normally again.

Closes plan.md's member-flow item #3 (the `membership_expiring` third of
it) and known-issues.md's NOTIF-004. The dedup policy (once per run, not
once per membership ever — see the "Chosen policy" paragraph in that
known-issues.md entry) was made explicit rather than silently decided,
per Rule 8.

---

## 2026-08-07 — FIX(classes): notify members when their booking is cancelled

**Type:** FIX
**Defect:** NOTIF-003
**Behavior change:** yes — members whose `booked` personal booking gets
cancelled by an admin now receive a `class_cancelled` notification.
`classes.cancel`'s own return value/shape is unchanged.
**Files:** `src/server/routers/classes.ts` (`cancel`'s bookings update
now uses `.returning()` to know who to notify; one notification inserted
per affected member)
**Tests:** no automated test harness in this branch — verified manually
against the running dev server: booked a class as a member, cancelled
the class as admin via `classes.cancel`, confirmed the booking flipped
to `cancelled` (unchanged existing behavior) and the member's
`notifications.list` gained a `class_cancelled` row referencing the
right class name/time. Also confirmed a *waitlisted* booking on the same
class received no notification (matches CLASS-004's untouched scope).

Closes plan.md's member-flow item #3 (the `class_cancelled` third) and
known-issues.md's NOTIF-003. Does not expand CLASS-004 — waitlisted and
corporate bookings on a cancelled class are still not cancelled, still
not refunded, and (since nothing touches them) still not notified.

---

## 2026-08-07 — FIX(bookings): notify members on waitlist promotion

**Type:** FIX
**Defect:** NOTIF-002
**Behavior change:** yes — a member (personal or corporate) promoted off
a waitlist now receives a `waitlist_promotion` notification. Both
`cancel` mutations' return values/shapes are unchanged.
**Files:** `src/server/routers/bookings.ts` (`cancel`'s promotion block),
`src/server/routers/corporate-bookings.ts` (`cancel`'s promotion block)
**Tests:** no automated test harness in this branch — verified manually:
filled a class to capacity, added a second booking (waitlisted),
cancelled the confirmed one, confirmed the waitlisted booking was
promoted (unchanged existing behavior, credit deduction included) and
the promoted member's `notifications.list` gained a `waitlist_promotion`
row naming the right class. Repeated the same sequence for
`corporateBookings.cancel`/`corporateBookings.book`.

Closes plan.md's member-flow item #3 (the `waitlist_promotion` third)
and known-issues.md's NOTIF-002. BOOK-004 and CORP-001 (the promotion
logic's own pre-existing bugs) are untouched — the notification fires
regardless of whether the promotion itself was actually eligible.

---

## 2026-08-06 — FIX(bookings): add member-facing UI for corporate booking

**Type:** FIX
**Defect:** CORP-005
**Behavior change:** yes — `/schedule`'s book button now offers company
credits as an explicit option for members linked to an active company,
and `/dashboard` gained a "Corporate bookings" section. One new
read-only query added (`corporateBookings.myCompany`); no existing
procedure's input, output, error code, or error message changed —
`corporateBookings.book`/`cancel`/`mine` were called exactly as they
already existed, not modified.
**Files:** `src/server/routers/corporate-bookings.ts` (new `myCompany`
query, exposes the existing internal `getCompanyForMember` helper to its
own caller), `src/app/schedule/page.tsx` (new `BookButton` component:
unchanged single button for non-linked members, hover/click-expanding
personal-vs-company choice for linked members), `src/app/dashboard/page.tsx`
(new "Corporate bookings" section, Cancel-only, parallel to the existing
"Upcoming bookings" section)
**Tests:** no automated test harness in this branch (same as AUTH-002) —
verified manually against the running dev server using seed data's real
company links (`seed.ts` links `members[0..2]` to "TechCorp Inc", credit
pool 100):
1. Signed in as a non-linked member on `/schedule` → book button
   unchanged, single "Book"/"Join waitlist" label, no split — confirms
   zero visual/behavioral change for the common case.
2. Signed in as a TechCorp-linked member → button expands into "Personal
   credits" / "TechCorp Inc credits" on hover and on click.
3. Booked with company credits → `corporate_bookings` row inserted with
   the class's `creditCost`, `companies.creditPoolBalance` decremented by
   the same amount (checked directly against `flexfit.db`).
4. Booked the same/another class with personal credits as a different,
   non-linked member → ordinary `bookings`/`memberships` flow completely
   unaffected.
5. `/dashboard` → new "Corporate bookings" section showed the booking;
   Cancel → status flips to `cancelled`, credit pool refunded per the
   existing (unmodified) 24h-window rule in `corporate-bookings.ts`.
6. `tsc --noEmit` and `pnpm build` both clean.
Test data created during verification was cancelled/left in a clean
state; no seed data was altered.

Closes plan.md's member-flow item #2 ("Corporate booking fully dead in
the UI") and known-issues.md's CORP-005. CORP-001 through CORP-004 (all
pre-existing bugs in `corporate-bookings.ts`'s `book`/`cancel`) were read
closely before building this UI on top of them and are explicitly **not**
touched — this fix only closes the "no UI" gap, per AGENT_RULES.md's Rule
3/4 (one defect per commit; the underlying correctness bugs are separate,
larger FIXes with their own open policy questions, not guessable here per
Rule 8).

---

## 2026-08-06 — FIX(auth): add member signup page

**Type:** FIX
**Defect:** AUTH-002
**Behavior change:** yes — a new route (`/signup`) now exists and is
reachable from `/login` and `NavBar`. No existing route, procedure input/
output, error code, or error message changed; `auth.register` and
`auth.login` were called exactly as they already existed, not modified.
**Files:** `src/app/signup/page.tsx` (new), `src/app/login/page.tsx`
(fixed a now-inaccurate header comment claiming no signup page exists;
added a "Create an account" link), `src/components/NavBar.tsx` (added a
"Sign up" button next to "Sign in" for signed-out visitors)
**Tests:** no automated test harness in this branch (removed at request
on `organizing-the-code`) — verified manually against the running dev
server via direct HTTP calls to the tRPC endpoints:
1. `auth.register` with a fresh email → 200, returns `{id, name}`.
2. `auth.login` with the same email/password → 200, returns
   `{id, name, role}`, sets a session cookie.
3. `auth.me` with that cookie → returns the newly-created user, confirming
   the session is real and the signup→login chain actually authenticates.
4. A second `auth.register` with the same email → `CONFLICT`, unchanged
   message, confirming the existing duplicate-email behavior still holds.
Also ran `tsc --noEmit` and `pnpm build` (clean, `/signup` compiles as a
static route). The test user created during manual verification was
deleted from the dev database afterward so `flexfit.db` is unpolluted.

Closes plan.md's member-flow item #1 ("No signup UI — backend register
exists, no page") and known-issues.md's AUTH-002. `auth.register` was
read closely for other defects before building on top of it — found
none; plan.md's own framing already treats it as backend-correct,
UI-only gap, which the manual verification above confirms. No other
files were touched — AUTH-001 (passwordHash leak via `auth.me`) is
unrelated to this fix and remains open.

---

## 2026-08-06 — CHORE: remove all test files and test infrastructure

**Type:** CHORE
**Defect:** n/a
**Behavior change:** no — nothing in `src/` application code was
touched by this removal.
**Files removed:** all 14 `*.test.ts` files (`src/lib/format.test.ts`,
`src/lib/password.test.ts`, and 12 files under
`src/server/routers/*.test.ts`), the entire `tests/setup/` directory
(fixtures, mocks, the tRPC-caller harness, the disposable-DB
global-setup), `vitest.config.ts`, `drizzle.test.config.ts`, and the
on-disk `test-data/` scratch database. Reverted the two `.gitignore`
lines (`/test-data`, `/drizzle-test-out`) that only existed to support
this now-removed infra.
**Tests:** n/a — this entry *is* the removal of the tests.

At the user's explicit request. All comments and Rule 5 documentation
added to the actual application files (every router, `schema.ts`,
`db/index.ts`, `seed.ts`, `trpc.ts`, `src/lib/*`, and every frontend
page/component) remain untouched and in place — this removal only
deleted newly-added test code and test tooling, nothing under
`src/server/routers/*.ts`, `src/db/*.ts`, `src/lib/*.ts`, `src/app/**`,
or `src/components/**` was modified.

Note for future work: `known-issues.md`'s "Reproduction" lines for
AUTH-001 through RESCH-004 point at test files that no longer exist on
disk. Left as-is — they remain an accurate historical record of how each
defect was confirmed during this session, even though the reproduction
itself isn't currently re-runnable. If characterization tests are
rebuilt later, matching filenames would keep those references live
again.

---

## 2026-08-06 — TEST(infra): add vitest config and path alias

**Type:** TEST
**Defect:** n/a
**Behavior change:** no — test-runner config only, no application code touched.
**Files:** `vitest.config.ts` (new)
**Tests:** n/a (this *is* the test infra)

`package.json` already declared a `test` script but no vitest config
existed, so `@/...` imports would fail inside test files. Added config
resolving `@` to `./src` to match `tsconfig.json`.

---

## 2026-08-06 — REFACTOR(lib): comment format.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** `src/lib/format.ts`
**Tests:** added `src/lib/format.test.ts` (6 cases: formatMoney whole/zero/
truncation/negative, formatDateTime, formatDate) — run and green against
the file *before* comments were added, then re-run and still green after.

Added file header and per-function header comments (Rule 5), including a
note that `formatDateTime`/`formatDate` render in the process's local
timezone since no `timeZone` option is passed — a pre-existing behavior,
not changed here. No lines of logic touched.

---

## 2026-08-06 — REFACTOR(db): comment schema.ts, no column/type change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** `src/db/schema.ts`
**Tests:** no tRPC-level test applies (pure table definitions, no logic).
Verified instead by pushing the schema against a disposable copy of
`flexfit.db` before and after the edit — both times `drizzle-kit push`
reported the change as fully applied with nothing outstanding, i.e.
identical structure. Also ran `tsc --noEmit`, clean.

Added a file header and a comment above each of the 13 tables describing
its purpose and any non-obvious behavior it's involved in (e.g. the
`checkins.bookingId`-only-links-to-personal-bookings gap, the unused
notification types, trainer availability being interpreted as UTC). No
column, type, default, or constraint changed.

---

## 2026-08-06 — REFACTOR(db): comment db/index.ts and seed.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** `src/db/index.ts`, `src/db/seed.ts`
**Tests:** `tsc --noEmit` clean; full existing test suite (12 tests) still
green. Did not re-run the seed script against the dev database for this
comment-only change — a line-by-line diff confirmed only comment blocks
were added.

Added file headers to both, plus two inline notes on `seed.ts`: the
FK-respecting delete order, and that its sample `notifications` rows
(waitlist_promotion/class_cancelled/membership_expiring) and the absence
of any seeded `corporateBookings` rows are illustrative only — not
evidence those flows are wired up elsewhere in the app.

---

## 2026-08-06 — TEST(infra): build the tRPC-caller test harness

**Type:** TEST
**Defect:** n/a
**Behavior change:** no — test infra only, no `src/` application file touched.
**Files:** `drizzle.test.config.ts` (new), `tests/setup/test-db-path.ts`,
`tests/setup/global-setup.ts`, `tests/setup/reset-db.ts`,
`tests/setup/test-caller.ts`, `tests/setup/mock-next-headers.ts` (all
new), `vitest.config.ts` (added `env`/`globalSetup`/`setupFiles`),
`.gitignore` (added `/test-data`, `/drizzle-test-out`)
**Tests:** n/a (this *is* the test infra layer routers will be tested through)

Builds a disposable test database from `schema.ts` before the suite runs,
resets it between tests, and provides a `createTestCaller(user, token)`
helper plus a `next/headers` cookie mock so `auth.ts`'s `login`/`register`/
`logout` (which call `cookies()` directly) can be exercised outside a real
Next.js request. See `architecture-decisions.md` for the full reasoning.

---

## 2026-08-06 — REFACTOR(auth): comment auth.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see AUTH-001 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/auth.ts`
**Tests:** added `src/server/routers/auth.test.ts` — 13 cases (me
signed-out/signed-in incl. the passwordHash leak, login happy path +
session/cookie side effects, case-insensitive email match, whitespace
validation rejection, wrong password, unknown email, deactivated user,
register happy path + hashed password, duplicate email, short password
validation, logout with/without a token). Ran and green against
unmodified `auth.ts` first, then unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5), including
`@throws` codes. While characterizing `me`, found it returns the full
`ctx.user` row — including `passwordHash` — to the client on every call.
Logged as **AUTH-001** in `known-issues.md` (DOCUMENT, not fixed here per
Rule 0/3) and referenced from the code comment. No logic changed.

---

## 2026-08-06 — DOCUMENT(auth): log AUTH-001 (passwordHash exposed via auth.me)

**Type:** DOCUMENT
**Defect:** AUTH-001
**Behavior change:** no — nothing in the code changed for this entry, the
bug is left exactly as it behaves today.
**Files:** `documents/known-issues.md` (new)
**Tests:** n/a (the existing behavior is already captured by
`auth.test.ts`'s passwordHash-leak case)

Found while writing characterization tests for `auth.me`. Documented
severity, current behavior, expected invariant, and what a future fix
would look like, per Rule 3's DOCUMENT requirements.

---

## 2026-08-06 — TEST(infra): run test files sequentially, fixes SQLITE_BUSY

**Type:** TEST
**Defect:** n/a
**Behavior change:** no — test infra only.
**Files:** `vitest.config.ts` (added `fileParallelism: false`)
**Tests:** n/a

Running `auth.test.ts` and `notifications.test.ts` in parallel (Vitest's
default) caused concurrent connections to the same test SQLite file to
hit "database is locked" on overlapping `resetDb()` deletes. Forcing
sequential file execution fixes it without touching `db/index.ts`'s
connection setup. See `architecture-decisions.md` for the full reasoning
and a note on revisiting if the suite grows large enough for this to cost
meaningful time.

---

## 2026-08-06 — REFACTOR(notifications): comment notifications.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see NOTIF-001 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/notifications.ts`
**Tests:** added `src/server/routers/notifications.test.ts` — 10 cases
(unreadCount scoped to caller, list ordering/scoping/limit,
markAllAsRead scoped + leaves already-read alone, broadcast happy path +
role exclusion, broadcast including deactivated members, broadcast with
zero members, broadcast rejecting a non-admin). Green against unmodified
code first, unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5). While
characterizing `broadcast`, confirmed the `activeMembers`-name-vs-role-only-filter
mismatch already flagged in `plan.md` (item #34) — logged formally as
**NOTIF-001** in `known-issues.md` with a passing test as reproduction,
referenced from the code comment. No logic changed.

---

## 2026-08-06 — DOCUMENT(notifications): log NOTIF-001 (broadcast reaches deactivated members)

**Type:** DOCUMENT
**Defect:** NOTIF-001
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** n/a (captured by `notifications.test.ts`'s NOTIF-001 case)

---

## 2026-08-06 — TEST(infra): add shared createUser fixture

**Type:** TEST
**Defect:** n/a
**Behavior change:** no
**Files:** `tests/setup/fixtures.ts` (new)
**Tests:** n/a (used by plans.test.ts, see below)

Third test file needing the same "insert a user with defaults" helper —
centralized it rather than writing a fourth copy. `auth.test.ts`/
`notifications.test.ts` keep their own local copies; see
architecture-decisions.md for why they weren't retrofitted.

---

## 2026-08-06 — REFACTOR(plans): comment plans.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see PLAN-001 through PLAN-004 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/plans.ts`
**Tests:** added `src/server/routers/plans.test.ts` — 12 cases (list
active-only/includeInactive, subscribe happy path + payment fields,
subscribe default method, plan not found, inactive plan, double-subscribe
creating two active memberships, same-millisecond reference collision via
mocked `Date.now()`, create happy path + defaults, create rejects
non-admin, setActive toggle, setActive on a missing id). Green against
unmodified code first, unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5). While
characterizing `subscribe`/`setActive`, confirmed three items already on
plan.md's list (multiple active memberships #19, non-atomic writes #23,
reference collision #24) and found one new gap (`setActive` silently
returning `undefined` instead of throwing `NOT_FOUND` for a bad id, unlike
comparable procedures elsewhere in the codebase). Logged as
**PLAN-001**–**PLAN-004** in `known-issues.md`, referenced from the code
comments. No logic changed.

---

## 2026-08-06 — DOCUMENT(plans): log PLAN-001 through PLAN-004

**Type:** DOCUMENT
**Defect:** PLAN-001, PLAN-002, PLAN-003, PLAN-004
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** PLAN-001/003/004 each have a passing reproduction test in
`plans.test.ts`; PLAN-002 (non-atomic writes) is confirmed by reading the
source — forcing a mid-transaction failure is beyond what a
characterization test can reasonably simulate, noted as such in the entry.

---

## 2026-08-06 — REFACTOR(payments): comment payments.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see PAY-001 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/payments.ts`
**Tests:** added `src/server/routers/payments.test.ts` — 12 cases (mine
scoped to caller + plan-name join incl. null case, all with member
name/email + default/custom limit + non-admin rejection, markPaid
happy/refunded-rejected/not-found, refund happy path + membership
cancellation, refund leaving bookings/credits untouched, refund with no
linked membership, refund rejecting a non-paid payment). Green against
unmodified code first, unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5). While
characterizing `refund`, confirmed the item already on plan.md's list
(#22 — refund doesn't reconcile bookings/credits) with a passing
reproduction test, logged as **PAY-001**. No logic changed.

---

## 2026-08-06 — DOCUMENT(payments): log PAY-001 (refund doesn't reconcile bookings/credits)

**Type:** DOCUMENT
**Defect:** PAY-001
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** captured by `payments.test.ts`'s PAY-001 case

---

## 2026-08-06 — REFACTOR(members): comment members.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see MEMBER-001 through MEMBER-003 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/members.ts`
**Tests:** added `src/server/routers/members.test.ts` — 18 cases (profile
null-membership/attended-count/latest-endDate-wins-regardless-of-status,
updateProfile full and partial update, search by substring +
all-roles-when-empty-query + non-staff rejection, byId strips
passwordHash + not-found, setActive/setRole happy path + silent-undefined
on bad id, lookupByEmailOrPhone by email/phone + non-member rejection +
arbitrary-match-on-shared-substring). Green against unmodified code
first, unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5). While
characterizing, confirmed one item already on plan.md's list
(`lookupByEmailOrPhone`'s arbitrary partial match, #26) and found two new
gaps (`profile` picking the latest-endDate membership regardless of
status — same root cause as plan.md #20's dashboard/booking disagreement,
but this is the `members.ts` side of it; and `setActive`/`setRole`
sharing the same silent-undefined-on-missing-id gap as PLAN-004). Logged
as **MEMBER-001** through **MEMBER-003** in `known-issues.md`, referenced
from the code comments. No logic changed.

---

## 2026-08-06 — DOCUMENT(members): log MEMBER-001 through MEMBER-003

**Type:** DOCUMENT
**Defect:** MEMBER-001, MEMBER-002, MEMBER-003
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** all three have passing reproduction tests in `members.test.ts`

---

## 2026-08-06 — REFACTOR(trainers): comment trainers.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see TRAINER-001/002 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/trainers.ts`
**Tests:** added `src/server/routers/trainers.test.ts` — 12 cases
(upcomingClasses scoped + non-trainer rejection, availability
upsert-by-day, nonsense time string accepted, removeAvailability
always-succeeds, FORBIDDEN checks, checkAvailability no-availability/
in-window/outside-window/conflicting-class/UTC-day-mismatch/non-staff-
rejection). Green against unmodified code first, unchanged after the
comment-only edit.

Added file header and per-procedure header comments (Rule 5), plus a
loop-intent comment on the conflict-scan loop in `checkAvailability`.
Confirmed two items already on plan.md's list (#29 time validation, #30
UTC-vs-local mismatch) with deterministic reproduction tests — the
UTC-mismatch test picks a UTC timestamp that lands on a different
calendar day in IST specifically so the test doesn't depend on the
machine's local timezone. Logged as **TRAINER-001**/**TRAINER-002**. No
logic changed.

---

## 2026-08-06 — DOCUMENT(trainers): log TRAINER-001/002

**Type:** DOCUMENT
**Defect:** TRAINER-001, TRAINER-002
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** captured by `trainers.test.ts`

---

## 2026-08-06 — REFACTOR(classes): comment classes.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see CLASS-001 through CLASS-004 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/classes.ts`
**Tests:** added `src/server/routers/classes.test.ts` — 15 cases (list
cancelled-filter/date-range/spotsLeft-computation, byId public roster
exposure + not-found, create defaults + unvalidated trainerId + non-staff
rejection, update partial-patch + not-found + under-capacity, cancel
booked-vs-waitlisted + credits/corporate-untouched + not-found +
non-admin rejection). Green against unmodified code first, unchanged
after the comment-only edit.

Added file header and per-procedure header comments (Rule 5). Confirmed
four items already on plan.md's list: public roster exposure (#10,
security-severity), capacity-below-occupancy (#32), unvalidated
trainerId (#33), and incomplete cancel cleanup (critical-list item 9) —
each now has a passing reproduction test. Logged as **CLASS-001** through
**CLASS-004**. No logic changed.

---

## 2026-08-06 — DOCUMENT(classes): log CLASS-001 through CLASS-004

**Type:** DOCUMENT
**Defect:** CLASS-001, CLASS-002, CLASS-003, CLASS-004
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** all four have passing reproduction tests in `classes.test.ts`

---

## 2026-08-06 — TEST(infra): investigate and route around a drizzle-orm/libsql query artifact

**Type:** TEST
**Defect:** n/a
**Behavior change:** no — test infra and test-design only.
**Files:** `src/server/routers/admin.test.ts`, `tests/setup/test-caller.ts`
(briefly gained then lost a `createFreshTestContext` helper during
investigation — reverted to its original form)
**Tests:** n/a (this entry is about *how* ADMIN-001 is tested, covered below)

While writing `admin.classUtilisation`'s characterization test, an exact
`booked` count assertion failed depending on suite-run context. Traced it
to a drizzle-orm query-compilation artifact specific to a correlated
subquery aliased as a select column (confirmed via a raw-SQL bypass on
the identical connection returning the correct value where drizzle's
compiled version didn't) — not an application bug. Resolved by asserting
the real invariant as a before/after comparison instead of an absolute
value. Full investigation trail in `architecture-decisions.md`.

---

## 2026-08-06 — REFACTOR(admin): comment admin.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see ADMIN-001/002 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/admin.ts`
**Tests:** added `src/server/routers/admin.test.ts` — 9 cases (stats
happy path + non-admin rejection, classUtilisation
corporate-booking-invisible, revenue-excludes-corporate-topups,
expiringMemberships window, refundCount, checkinsPerDay,
topTrainers, noShowList). Green against unmodified code first, unchanged
after the comment-only edit.

Added file header and per-procedure header comments (Rule 5), plus a
loop-intent comment on `noShowList`'s trainer-name batch lookup.
Confirmed two items already on plan.md's list (#1's corporate-blind
capacity counting as it applies to classUtilisation, and #47's missing
corporate revenue) with passing reproduction tests, logged as
**ADMIN-001**/**ADMIN-002**. Also noted `noShowList`'s dead-status gap
(no code path ever sets `no_show`) as a comment, not a numbered defect —
already covered narratively in plan.md, not independently reproduced by
a test here. No logic changed.

---

## 2026-08-06 — DOCUMENT(admin): log ADMIN-001/002

**Type:** DOCUMENT
**Defect:** ADMIN-001, ADMIN-002
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** captured by `admin.test.ts`

---

## 2026-08-06 — REFACTOR(admin-companies): comment admin-companies.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see COMPANY-001 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/admin-companies.ts`
**Tests:** added `src/server/routers/admin-companies.test.ts` — 16 cases
(list ordering, getById detail + not-found, create defaults +
non-admin rejection, updateActive toggle + not-found, topUp + not-found,
linkMember happy path + not-found company/user + non-member rejection +
duplicate-link conflict + second-company allowed, unlinkMember happy
path + not-found). Green against unmodified code first, unchanged after
the comment-only edit.

Added file header and per-procedure header comments (Rule 5). Confirmed
the item already on plan.md's list (#12 — a member can belong to
multiple companies) with a passing reproduction test, logged as
**COMPANY-001**. Also noted in a test name (not a numbered defect) that
`updateActive`/`topUp`/`linkMember`/`unlinkMember` all check existence
before mutating — the correct pattern, contrasted with PLAN-004/
MEMBER-003's silent-undefined gap elsewhere. No logic changed.

---

## 2026-08-06 — DOCUMENT(admin-companies): log COMPANY-001

**Type:** DOCUMENT
**Defect:** COMPANY-001
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** captured by `admin-companies.test.ts`

---

## 2026-08-06 — REFACTOR(bookings): comment bookings.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see BOOK-004 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/bookings.ts`
**Tests:** added `src/server/routers/bookings.test.ts` — 26 cases
covering `mine` (past/upcoming filter), `book` (happy path, unlimited
plan, waitlisting on full, not-found/cancelled/started/duplicate/
no-membership/insufficient-credit rejections), `cancel` (refund
before/inside the free window, not-found, owner/staff/forbidden,
already-inactive rejection, waitlist promotion + credit deduction,
**BOOK-004**'s zero-credit promotion, no-promotion-on-waitlisted-cancel),
`markAttended`, `rosterFor`, `upcomingForMember`, `checkinCountFor`, and
`waitlisted`'s queue-position math. Green against unmodified code first,
unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5), plus
loop-intent comments on the waitlist-promotion lookup and the
queue-position calculation. `cancel`'s header comment mirrors
AGENT_RULES.md's own Rule 5 worked example almost verbatim, since that
example *is* this function's real, confirmed behavior — logged formally
as **BOOK-004** in `known-issues.md` with a passing reproduction test.
No logic changed.

---

## 2026-08-06 — DOCUMENT(bookings): log BOOK-004

**Type:** DOCUMENT
**Defect:** BOOK-004
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** captured by `bookings.test.ts`

---

## 2026-08-06 — REFACTOR(corporate-bookings): comment corporate-bookings.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see CORP-001 through CORP-004 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/corporate-bookings.ts`
**Tests:** added `src/server/routers/corporate-bookings.test.ts` — 16
cases covering `mine`, `book` (happy path, waitlisting, capacity-blind-
to-personal-bookings, not-linked/insufficient-credit/duplicate
rejections), `cancel` (refund before/inside window, promotion + credit
deduction, **CORP-001**'s free-booking-on-insufficient-funds,
**CORP-003**'s no-cross-waitlist-coordination, not-found), `markAttended`
(incl. **CORP-004**'s always-null bookingId), and `rosterFor`. Two of my
own test assertions were initially wrong (forgot the cancelling owner's
own refund applies before the promotion step) — fixed the test math, not
the code, once the failure pointed at the real cause. Green against
unmodified code first, unchanged after the comment-only edit.

Added file header and per-procedure header comments (Rule 5), plus two
inline notes at the exact lines responsible for CORP-001 and CORP-003.
Confirmed three items already on plan.md's critical list (#1 capacity,
#2 waitlist coordination, #3 free-booking-on-promotion) and one more
(#15 corporate checkin traceability), each with a passing reproduction
test. Logged as **CORP-001** through **CORP-004**. No logic changed.

---

## 2026-08-06 — DOCUMENT(corporate-bookings): log CORP-001 through CORP-004

**Type:** DOCUMENT
**Defect:** CORP-001, CORP-002, CORP-003, CORP-004
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** all four have passing reproduction tests in `corporate-bookings.test.ts`

---

## 2026-08-06 — REFACTOR(reschedules): comment reschedules.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a (see RESCH-001 through RESCH-004 below — flagged, not fixed)
**Behavior change:** no
**Files:** `src/server/routers/reschedules.ts`
**Tests:** added `src/server/routers/reschedules.test.ts` — 13 cases
covering `reschedule` (happy path, not-found, forbidden, inside-window
rejection, name-mismatch rejection, waitlisting on a full target,
**RESCH-001** unpaid-confirmed-booking, **RESCH-002** double-charge via a
real book() + reschedule + promotion sequence, **RESCH-003** no
old-class-waitlist-promotion, **RESCH-004** wrong-credit-cost-preserved),
`history`, and `validateReschedule` (valid case + mirrors reschedule's
own not-found reason instead of throwing). One of my own test's setups
was wrong at first (RESCH-002 inserted the "original" booking directly
instead of through `bookings.book`, so no real charge had actually
happened before the promotion, making the test only show one deduction,
not two) — fixed the test to book for real first. Green against
unmodified code, unchanged after the comment-only edit.

Added file header (including why `reschedule`/`validateReschedule`
duplicate their logic rather than sharing it, per plan.md #53) and
per-procedure header comments. While reading closely for comments, found
`activeMembershipFor` and its one call-site local `membership` are both
genuinely dead — declared, computed, never read — confirmed by grepping
the file for other references before claiming it in a comment. Left in
place (this pass doesn't remove code) but flagged. Confirmed all four of
plan.md's critical-list reschedule findings (#5–#8) with passing
reproduction tests, logged as **RESCH-001** through **RESCH-004**. No
logic changed.

This closes out all of plan.md's Priority-1 backend files
(bookings.ts, corporate-bookings.ts, reschedules.ts, classes.ts,
trpc.ts, schema.ts) and all of Priority-2 — every router in
`src/server/routers/` now has characterization tests and Rule 5
comments.

---

## 2026-08-06 — DOCUMENT(reschedules): log RESCH-001 through RESCH-004

**Type:** DOCUMENT
**Defect:** RESCH-001, RESCH-002, RESCH-003, RESCH-004
**Behavior change:** no
**Files:** `documents/known-issues.md`
**Tests:** all four have passing reproduction tests in `reschedules.test.ts`

---

## 2026-08-06 — REFACTOR(frontend): comment every page/component, no logic change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** all 20 files under `src/app/**` and `src/components/**`
**Tests:** none added — no browser/visual tool was available this
session to verify a JSX extraction didn't change rendered output, so
this pass is comments only, no restructuring (see
architecture-decisions.md for the scoping decision). Verified instead
with `tsc --noEmit` (clean) and a full `pnpm build` (all 17 routes
compiled, clean) after every file, confirming the comment-only edits
didn't break anything.

**Note for whoever commits this:** these 20 files were reviewed and
commented together in one working session, but per Rule 8 ("one logical
change per commit") they should be split into individual commits when
actually committed — group boundaries below reflect a reasonable split.

Added a file-level or component-level header comment to every file,
per Rule 5. Grouped by what was found:

- **App shell** (`layout.tsx`, `providers.tsx`, `page.tsx`,
  `api/trpc/[trpc]/route.ts`) — structural comments only, no findings.
- **`login/page.tsx`, `NavBar.tsx`** — confirmed two items directly in
  the code: login always redirects to `/dashboard` regardless of role
  (plan.md #39), and NavBar shows "My bookings"/"Waitlist" to any
  signed-in user, not just members (plan.md #40). Also noted the
  hardcoded demo credentials (plan.md #51).
- **`schedule/page.tsx`, `plans/page.tsx`, `waitlist/page.tsx`,
  `notifications/page.tsx`** — structural comments, cross-referencing
  the backend defects each page's data depends on (PLAN-001,
  notifications' unused types).
- **`reschedule-modal.tsx`** — confirmed both of plan.md's findings
  directly: `sameNameClasses` never receives or checks the original
  class's id despite the comment claiming it excludes it (#37), and
  `error` state is set but never reset anywhere (#38).
- **`dashboard/page.tsx`, `trainer/schedule/page.tsx`, `kiosk/page.tsx`**
  — `kiosk/page.tsx` confirmed `selectedMember: any` (plan.md #42) and
  that its expired-membership/no-credits warnings are client-side only,
  computed from `memberships[0]` (not necessarily current, same shape as
  MEMBER-002), with no server-side re-check in `markAttended`.
- **`admin/page.tsx`, `admin/attendance/page.tsx`,
  `admin/reports/page.tsx`, `admin/announcements/page.tsx`** — noted
  `admin/page.tsx` has no client-side role gate (unlike the other admin
  pages), the no-show list's permanent-emptiness, ADMIN-002's revenue gap
  surfacing here, and the announcement form's client-only validation.
- **`admin/companies/page.tsx`,
  `admin/companies/[id]/page.tsx`** — confirmed more `any` usage
  (plan.md #42) in the `[id]` page's search/member/booking handling, and
  noted the UI gives no warning when linking a member already linked to
  another company (COMPANY-001).

No JSX, logic, styling, or data-fetching changed in any file — every
diff is comment-only.

---

## 2026-08-06 — REFACTOR(server): comment trpc.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** `src/server/trpc.ts`
**Tests:** `tsc --noEmit` clean; existing suite still green (this file has
no dedicated test yet — it's exercised indirectly once router tests exist).

Added a file header and header comments on `createContext` and all four
procedure builders (`publicProcedure`/`protectedProcedure`/
`staffProcedure`/`adminProcedure`), including `@throws` codes and a note
on `createContext` not re-checking `users.active` for an existing session
(a pre-existing gap, not touched here — see plan.md's deactivated-session
finding). No logic changed.

---

## 2026-08-06 — REFACTOR(lib): comment password.ts, no logic change

**Type:** REFACTOR
**Defect:** n/a
**Behavior change:** no
**Files:** `src/lib/password.ts`
**Tests:** added `src/lib/password.test.ts` (6 cases: hash format, salt
randomness, correct/incorrect verify, malformed stored value, empty salt/
digest half) — green before and after the comment-only edit.

Added file header and per-function header comments (Rule 5), noting the
scrypt default cost parameters and that `verifyPassword` returns `false`
rather than throwing on a malformed stored value. No lines of logic
touched.
