# Architecture decisions

Running log of structural decisions made during the `organizing-the-code`
branch, and the reasoning behind each one. Per AGENT_RULES.md Rule 7, there
is no single correct layout — this file is the record of why this one was
picked, so it can be defended.

---


----------------------------


# Architecture Decisions

This file tracks major structural changes to the codebase, as required by `AGENT_RULES.md` Rule 1.2.

## 2026-08-09: `studio_settings` Table
**Context:** The application previously had a hardcoded 30-minute check-in window. To support enterprise/professional administration, the studio needs to configure rules dynamically without redeploying code.
**Decision:** Added a `studioSettings` table to `src/db/schema.ts` to hold global configuration values, starting with `checkinWindowMinutes`.
**Consequences:** 
- A migration (`db:push`) is required.
- Routers that depend on time boundaries (e.g., `bookings.ts` and `corporate-bookings.ts` `markAttended`) must now execute a read query against this table before validating.
- The Admin dashboard requires a new UI panel to manage these settings.



-------------------------------------

## 2026-08-07 — Database Indexing for Schedule Load Performance

**Decision:** Added `classes_starts_at_idx` and `bookings_class_id_idx` indexes via Drizzle schema to `flexfit.db`.

**Why:** The `classes.list` tRPC query (used heavily by the public `/schedule` page) runs a correlated SQL subquery `(select count(*) from bookings where classId = classes.id)` to determine `spotsLeft`. Because `classId` was unindexed, SQLite performed an O(N) full table scan of the `bookings` table for *every single scheduled class item*. Adding an index to `bookings.classId` transforms this scan into an instant O(1) lookup, resolving the dev-mode lag and ensuring production scales beyond a few hundred bookings without throttling.

---

## 2026-08-15 — Correction: five prior entries described a test harness that was never actually built

**What was found:** the five entries this replaces — "Test runner setup,"
"Test file location: colocated, not mirrored," "tRPC-caller test harness
design," "Test files run sequentially, not in parallel," and "Shared
`createUser` fixture" (plus the "Test-infra gotcha" entry that followed
them, describing a debugging session against `admin.test.ts`) — described,
in confident past tense, a full `vitest.config.ts` + `tests/setup/`
harness: `test-db-path.ts`, `global-setup.ts`, `reset-db.ts`,
`test-caller.ts`, `mock-next-headers.ts`, a shared fixtures file, and
several `.test.ts` files (`format.test.ts`, `auth.test.ts`,
`notifications.test.ts`, `plans.test.ts`, `admin.test.ts`).

**None of it exists.** Checked directly: no `vitest.config.ts` anywhere
in the working tree, no `tests/` directory, no `.test.ts` file under
`src/` on any branch. Searched the *entire* git history across every
local and remote branch for these exact filenames — zero results. This
wasn't built and later deleted; it was never committed at all.

**Why this matters:** this is different from — and worse than — simply
not having tests. `AGENT_RULES.md` Rule 3's DOCUMENT type and the brief's
own "fix it carefully, or write it up clearly and leave it alone" both
assume the write-up is honest. These five entries instead asserted
infrastructure existed when it didn't, which is exactly the kind of
discrepancy the "communication" and "documentation organisation"
judging criteria are checking for.

**One real, related attempt does exist, for context — but it isn't this
harness:** `origin/fix/testing` (still on the remote, never merged) has
a genuine `vitest.config.ts` and three real test files
(`src/tests/bookings.test.ts`, `date.test.ts`, `ratelimit.test.ts`).
It's a different, much smaller effort than the five entries above
describe (no `tests/setup/`, no DB harness, one file mocks `ioredis`
directly instead), and it's **112 commits behind current `main`, only 2
ahead** — branched early and never caught up with any of the later
FIX/DOCUMENT work this log records. One of its tests even imports
`src/lib/date.ts`, a module that never made it to `main` at all. Not
usable as a base to merge or extract from without it fighting the
current code; noted here only so the record is complete, not because
it's the thing the five corrected entries described.

**Current real status:** no automated tests exist anywhere in the
current codebase. Every "Verified live" note across `known-issues.md`'s
50 defect entries is a manual E2E check — either by hand against the
running dev server, or via a temporary, untracked, deleted-after-use
script calling `appRouter.createCaller(...)` directly (the pattern
first used for `CLASS-005`/`TRAINER-003`). That pattern is real and has
been used repeatedly; it was just never turned into a committed,
reusable harness.

**What's actually being built now:** see `documents/restructure-plan.md`
Phase 0 — a deliberately minimal harness (a `createTestCaller` helper +
a DB-reset function, nothing more), built fresh against the current
codebase, to what Rule 6 actually asks for rather than the elaborate,
undelivered design these entries claimed.

---

## 2026-08-06 — `src/lib/format.ts` and `src/lib/password.ts`: no move

**Decision:** Left in place. Both files are already single-purpose (display
formatting; password hashing) and small — nothing to split, no shared
folder they clearly belong to yet. Comments added, logic untouched.

---

## 2026-08-06 — `schema.ts` / `db/index.ts` / `seed.ts` / `trpc.ts`: comment-only, verified against a scratch DB copy

**Decision:** Added file/table/function header comments only. Before and
after commenting `schema.ts`, ran `drizzle-kit push` against a disposable
copy of `flexfit.db` (outside the repo, in the session scratchpad) and
confirmed it applies with zero structural changes both times — i.e. the
comments introduced no accidental column/type/constraint edits. Did not
run `seed.ts` against real `flexfit.db` for this pass, since a diff review
plus `tsc --noEmit` was sufficient to confirm only comments were added to
a script with no exported logic anything else depends on.

**Why the scratch-DB check:** Rule 1.2 singles out `schema.ts` as needing
extra care ("never touch casually"). A `tsc --noEmit` pass alone wouldn't
catch a comment placed such that it accidentally altered a column
definition — pushing to a real SQLite connection and getting "no changes"
is a stronger guarantee.

---

## 2026-08-06 — Frontend pass: comments only, no component extraction

**Decision:** every file under `src/app/**` and `src/components/**` got
a Rule 5 header comment (file/component responsibility, cross-references
to backend defects the page depends on), but none were split into
`src/features/*/components/` as the original plan for this branch
proposed.

**Why:** the plan's safety net for a frontend restructuring pass was a
manual before/after walkthrough in a running browser — this session had
no browser or screenshot tool available, only `tsc --noEmit` and
`pnpm build` for verification. Those two catch type errors and build
failures, but neither can confirm a JSX extraction produced pixel- or
behavior-identical output, which is the actual guarantee Rule 0 requires
for a REFACTOR. Commenting in place carries no such risk (a comment
can't change rendered output), so it was safe to do now; extraction was
deferred rather than done without the ability to verify it.

**What this means for next steps:** the `src/features/**` frontend
layout from the original plan is still the target — it just needs either
a session with browser/screenshot access, or the app owner manually
verifying each extracted page against its current behavior before that
commit lands.

---

## 2026-08-07 — `src/features/bookings/capacity-service.ts`: first file under `src/features/`

**Decision:** introduced `src/features/bookings/capacity-service.ts`
(the CORP-002 fix — see EDIT_LOG.md/known-issues.md) as the very first
file under `src/features/`, ahead of the broader frontend/backend
restructuring this branch's earlier entries deferred. Only the one piece
of logic needed for this fix (confirmed-occupancy counting) was
extracted — `bookings.ts`, `corporate-bookings.ts`, and `reschedules.ts`
were **not** otherwise restructured into thin routers; they still
contain all their other business logic in place.

**Why:** AGENT_RULES.md Rule 7 gives `src/features/bookings/
capacity-service.ts` as its own literal worked example for exactly this
kind of shared, cross-router concern — following it directly rather than
inventing a different location (e.g. `src/server/services/`) for what
the constitution already named. Scoping the extraction to only the
capacity check (not a full router rewrite) matches Rule 4: this commit
fixes one defect (CORP-002), not "start the general refactor."

**What this means for next steps:** `src/features/bookings/` now exists
as a real directory with one file in it. Future extractions
(`booking-service.ts`, `waitlist-service.ts`, etc., per Rule 7's
example) have a home to land in without a fresh structural decision —
though each should still get its own entry here when it happens, per
Rule 7's "no single correct layout, only one you can defend."

**Note on the earlier "no browser/screenshot tool" entries above:** that
constraint no longer holds — a later session in this repo (the
`reschedule-modal-member` branch) got Playwright/Chromium working via
`npx playwright install chromium`, and used it for live browser
verification. Recorded here so this file doesn't quietly contradict
itself for a future reader; the deferred `src/features/**` frontend
extraction from the entry above could now be done with real
before/after screenshot verification if picked back up.

---

## 2026-08-08 — PLAN-001 policy: reject a second subscription instead of allowing multiple active memberships

**Decision:** `plans.ts`'s `subscribe` now rejects (`CONFLICT`) a
subscription attempt while the caller already has a `status: "active"`
membership, instead of silently inserting a second one. No
renewal/extension/queueing support was added.

**Why this needed a decision, not just a fix:** plan.md's own PLAN-001
writeup lists four plausible policies (reject / extend / queue /
stack-with-explicit-charge) and says explicitly the choice "should not
be guessed during refactoring" — unlike COMPANY-001, where plan.md
itself named one option as "the simpler and safer rule." This one had no
stated preference, so per Rule 8 it was put to the user directly rather
than picked silently.

**Why Reject over the other three:**
- **Pure subtraction of the bad behavior.** Reject requires no new
  status values, no rule for how credits combine across two plans, and
  no "who flips it to active later" logic — Extend and Queue both need
  new concepts the schema/code don't have today.
- **Precedent already set in this codebase.** COMPANY-001 (fixed earlier
  this session) took the identical shape for a structurally similar
  problem: "one X per user, reject a second." Reject is the direct
  analogue, not a new pattern to justify separately.
- **Actually closes the defect.** The core problem is "two simultaneous
  active memberships, and downstream code (MEMBER-002's resolution,
  `bookings.ts`'s separate lookup) can disagree about which one is
  current." Reject makes that state unreachable via `subscribe`. Stack
  would leave the ambiguity in place, just labeled; Extend/Queue still
  allow a transient multi-row state while switching over.

**Named tradeoff, not hidden:** a member who wants to renew before their
current membership expires has no self-serve path — they must wait for
it to end, or have staff cancel/refund it first (e.g. via
`payments.refund`, unmodified). This is a real, narrower UX gap,
recorded here and in known-issues.md's PLAN-001 entry as a deliberate
scope boundary of this fix, not solved by it.

**Verification note:** confirming the fix required actually clearing a
seeded member's active membership to exercise the "success after no
active membership" path — done via the existing (unmodified)
`payments.refund` against the dev server, not by editing the database
directly, so the verification exercised real application code end to
end.
## 2026-08-08 — `companyMembers.userId` made unique (COMPANY-001 fix)

**Decision:** added `.unique()` to `companyMembers.userId` in
`schema.ts`, enforcing "one company per member" at the database level,
per plan.md's own recommendation for COMPANY-001 ("the simpler, safer
rule" vs. supporting multiple companies per member with an explicit
company-selector in the UI). `admin-companies.ts`'s `linkMember` was
updated to check for *any* existing link for the user (not just an
exact user+company duplicate) and reject it with a clear `CONFLICT`
before the insert would otherwise hit the new DB constraint.

**Why a schema change instead of just an application-level check:**
Rule 1.2 permits schema changes when a migration and a recorded reason
exist, and plan.md's own COMPANY-001 writeup treats the DB constraint as
the actual fix, not the application-level pre-check alone — a
check-then-insert without a backing constraint is exactly the kind of
race-prone pattern flagged separately in plan.md's DB-integrity section
(#43). `linkMember`'s pre-check exists for a *clean error message*, not
as the sole enforcement.

**Migration mechanics:** this repo has no versioned migration files —
`drizzle.config.ts` is push-based (`out: "./drizzle"` is configured but
unused; `pnpm db:push` diffs the live schema directly). Attempting
`drizzle-kit push` to *add* a unique constraint to the existing
`company_members` table in place failed with `LibsqlError: SQLITE_ERROR:
no such index: company_members_user_id_unique` — a drizzle-kit/libsql
ordering bug in the generated `ALTER TABLE` batch when adding a unique
index to an already-populated table (not an application bug; the same
class of drizzle/libsql driver quirk already noted in the
`ADMIN-001`-adjacent test-infra entry above). Since `flexfit.db` is the
disposable dev database (already reset earlier in this session, no real
user data), the constraint was applied via `pnpm db:reset`
(drop file → fresh `db:push`, a plain `CREATE TABLE` with the constraint
inline, not an `ALTER` → `db:seed`) instead of an in-place push. Seed
data was checked first and confirmed to link no user to more than one
company, so the reset+reseed didn't hide a real conflict.

**Verified manually** (no test harness in this branch — see the CHORE
removal entry in EDIT_LOG.md) against the reset dev server: linking a
previously-unlinked member to a company succeeds; linking that same
member to a *second, different* company now returns `CONFLICT` with
"This member is already linked to a different company. Unlink them
first."; re-linking to the *same* company still returns the original
"This member is already linked to this company." message unchanged.
`tsc --noEmit` and `next build` both clean.

**Not in scope:** `corporate-bookings.ts`'s `getCompanyForMember` was
left functionally identical (its `.get()` call and `companies.active`
filter are unchanged) — only its comment was updated, since the
ambiguity it previously documented (arbitrary pick among multiple
active companies) can no longer occur once the constraint is live.

---

## 2026-08-08 — `src/features/memberships/` folder + `getCurrentMembership`, shared between bookings.ts and members.ts (MEMBER-002)

**Decision:** created `src/features/memberships/current-membership.ts`
exporting `getCurrentMembership(db, userId)`, alongside the existing
`src/features/bookings/`. `bookings.ts`'s private `activeMembershipFor`
was moved there verbatim (Commit 1, REFACTOR, no behavior change), then
`members.ts`'s `profile` was switched to call the same function instead
of its own looser query (Commit 2, FIX — see the entry below and
EDIT_LOG.md for the split reasoning).

**Why a new top-level feature folder instead of putting this in
`src/features/bookings/`:** a membership's "is this the one the caller
should book/pay against right now" resolution is used by both
`bookings.ts` (booking eligibility) and `members.ts` (profile/dashboard
display) — it's a membership concern that bookings.ts happens to need,
not a bookings concern. Nesting it under `src/features/bookings/` would
make `members.ts` import from a folder named after a different domain,
which is exactly the kind of misplaced-responsibility Rule 7 warns
against. A sibling `src/features/memberships/` folder is the direct
parallel to the existing `src/features/bookings/` and gives future
membership-resolution logic (e.g. if PLAN-001's renewal gap or the
startDate-check gap from plan.md item #21 get picked up later) an
obvious home.

**Why split into two commits (REFACTOR then FIX), not one:** the Prime
Directive and Rule 3 both say refactor and fix must never be hidden
inside the same change. Moving `bookings.ts`'s query verbatim into a
shared module is a pure extraction — `bookings.book`'s behavior is
byte-for-byte identical before and after (same where clause, same
orderBy, same tiebreak). Changing `members.ts`'s `profile` to use that
same resolver *is* a real behavior change (a member whose latest-endDate
membership is cancelled will now see their actual active one instead, or
nothing if they have none) — that's MEMBER-002's actual fix and needs
its own commit, defect reference, and before/after documentation per
Rule 3's FIX row.

**Not in scope:** `reschedules.ts` has a third, near-identical copy of
this same query — but it's dead code (declared, never called anywhere in
that file, already noted as such by its own comment and confirmed by
grep). Left untouched; resurrecting or removing dead code isn't part of
this defect and would be its own separate, unrequested change.
`getCurrentMembership` does not check `startDate` (plan.md item #21) —
carried forward unchanged from `bookings.ts`'s pre-extraction behavior,
not fixed here, and not yet its own numbered entry in known-issues.md.
Full consistency across all six call sites plan.md's MEMBER-002 writeup
names (Profile, Dashboard, Booking, Kiosk, Plan subscription, Admin
member details) is not attempted here — Dashboard and Profile both
render `members.profile` directly so they're covered by this fix
automatically, and Booking already used the correct definition before
this change; Kiosk's and Admin's membership-history display are a
different shape of problem (they show a full list, not a single "current"
pick) and are already flagged separately in their own file comments.

---

## 2026-08-08 — PAY-001 policy: refund cancels dependent bookings/waitlist entries, promotes freed seats

**Decision:** `payments.ts`'s `refund` now cancels every `booked`/
`waitlisted` row under the refunded membership, in addition to
cancelling the membership itself. A cancelled `booked` row's freed seat
triggers the existing shared `promoteNextWaitlisted`. Already-`attended`
bookings and `creditsRemaining` are left untouched.

**Why this needed a decision, not just a fix:** plan.md's PAY-001
writeup lists four plausible policies (cancel future bookings / keep
them valid / restore or remove credits / remove waitlist entries) with
no stated preference, and says explicitly "this should not be guessed
during refactoring." Put to the user directly per Rule 8, same as
PLAN-001.

**Why "cancel dependent bookings/waitlist, leave attended alone" over
the alternative (document-only, leave refund exactly as-is):**
- It's the interpretation that actually matches what "refund" means —
  the payment is being reversed, so what it paid for (future, unused
  classes) is reversed too. Leaving bookings valid after a refund would
  mean a member can attend classes for free, which is a starker
  inconsistency than the "no UI" or "silent undefined" gaps this repo's
  other DOCUMENT-only entries describe.
- It reuses machinery that already exists and is already trusted
  (`promoteNextWaitlisted`, the same function `bookings.cancel` calls) —
  no new waitlist/promotion logic was invented for this fix, keeping the
  change small and low-risk despite touching booking state.
- Leaving already-`attended` bookings alone avoids inventing a rule for
  something that already happened — a class that was already attended
  isn't "undone" by a later refund, and the schema has no concept of
  reversing a completed attendance.

**Why not also touch credits:** once the membership is `cancelled`,
`getCurrentMembership` (MEMBER-002/MEMBER-006, both fixed) never selects
it again for booking eligibility, regardless of what `creditsRemaining`
holds. Zeroing or preserving that field has no behavioral effect either
way — so this fix doesn't touch it, avoiding an unforced decision that
wouldn't change anything a user could observe.

**Not in scope:** corporate bookings are untouched — a personal
membership refund has no corporate-side counterpart to reconcile
(`payments.membershipId` never references a company). `payments.markPaid`
is unrelated and untouched. The promotion loop is not wrapped in a
transaction, same pre-existing gap `promoteNextWaitlisted`'s own header
comment already documents (plan.md's broader "no transactions" finding)
— not made worse by this fix, not fixed by it either.

---

## 2026-08-15 — `classes.ts` vs `adminClasses.ts`: resolved — kept separate, not consolidated

**Update (Phase 2 item 5 of `restructure-plan.md`):** read both
`create` implementations in full, side by side, to actually attempt the
consolidation this entry originally left as an open question. They are
**not** simple duplicated logic — they differ in three real, observable
ways:

1. **`trainerId` optionality.** `classesRouter.create`'s input schema
   has `trainerId: z.number().optional()` — a class can be created with
   no trainer assigned. `adminClassesRouter.create`'s has
   `trainerId: z.number()` — required.
2. **Trainer-role validation.** `adminClassesRouter.create` always loads
   the referenced user and throws `BAD_REQUEST` ("Selected user is not a
   valid trainer.") if they don't exist or aren't role `"trainer"`.
   `classesRouter.create` does no such check — it only calls
   `isTrainerAvailable` if a `trainerId` was given at all, and never
   verifies that id actually belongs to a trainer. This is exactly
   `CLASS-003` (documented, not fixed) manifesting concretely: the two
   routers disagree on whether this validation exists.
3. **Return shape.** `classesRouter.create` returns the full inserted
   class row. `adminClassesRouter.create` returns `{ ok: true }`.

**Decision: keep both routers, do not consolidate.** A shared extraction
would have to either (a) parameterize away all three differences —
at which point there's barely any logic left to actually share — or
(b) pick one behavior as canonical, which would silently fix `CLASS-003`
in one direction or reintroduce it in the other. Rule 3 requires a
REFACTOR to be behavior-identical; neither option qualifies as one.
This is a **DOCUMENT** resolution instead (Rule 3's third type): the
duplication is real, understood precisely now, and deliberately left as
two separate code paths rather than merged into one that would have to
guess which validation strictness is "correct" — exactly the kind of
call Rule 8 says not to make silently.

**What would make this resolvable later:** deciding, as an explicit
product/business call (not a refactor), whether `classesRouter.create`
*should* require and validate a real trainer the same way
`adminClassesRouter.create` does — i.e., actually fixing `CLASS-003` —
at which point the two would already match on point 2, and 1/3 could be
reconciled by a deliberate choice (require `trainerId` everywhere, or
allow it optional everywhere) rather than this REFACTOR guessing it.

**Correction to `known-issues.md`'s `CLASS-005` entry, unchanged from
before:** that entry states this duplication was *"logged as an open
question in architecture-decisions.md, not resolved here."* That was
inaccurate at the time — this is the first time it was actually written
down (Phase 0 of this branch). Left as its own note rather than quietly
backdated, for the same reason as the test-harness correction above.

**Why not resolved via consolidation (superseded framing, kept for
history):** the original two options considered were (a) consolidate,
deleting `adminClassesRouter.create` and pointing the admin UI at
`classesRouter.create`/`update`, adding `swapTrainer`-equivalent
functionality to `classesRouter` if kept; or (b) keep both, on the
theory that `classesRouter` is a staff-facing contract (trainers/admins
building schedules) and `adminClassesRouter` is admin-only tooling with
different validation needs — but nothing in the current code actually
enforces or documents that distinction, so option (b) as it stands today
is accidental duplication, not an intentional split. (Superseded — see
above: it isn't accidental duplication after all, it's three concrete,
real behavioral differences, one of which is `CLASS-003` itself.)

**Status:** resolved (DOCUMENT) — Phase 2 item 5 of
`documents/restructure-plan.md`. No code changed; both routers kept
exactly as they are, reasoning recorded above.

---

## 2026-08-15 — Data model: left as-is, not restructured

**Decision:** the core schema (`src/db/schema.ts`) is being left in its
current shape for this restructuring pass — no table merges, no new
normal forms, no consolidating `bookings`/`corporateBookings` into one
table with a credit-source column (plan.md's own suggested alternative
for `CORP-003`, considered and explicitly not taken).

**Why:** Item B states either choice is fine — *"staying in the
TypeScript and leaving the database alone is fine... going further and
changing the data model is also fine if you think the design needs
it... we're not after a particular depth, we're after a decision you can
defend."* The two-table `bookings`/`corporateBookings` split was
evaluated (`CORP-002`/`CORP-003`'s fixes both had to reason about it
directly) and kept because: consolidating them into one table with a
`creditSource` column would touch every query, every insert, and every
foreign key across `bookings.ts`, `corporate-bookings.ts`,
`reschedules.ts`, `admin.ts`, and `checkins` — a genuinely large,
high-risk migration for a benefit (avoiding duplicated *table*
structure) that's smaller than the risk of getting it wrong this close
to a deadline. The actual duplicated *logic* problem the two tables
create (capacity counting, waitlist ordering, credit checks, attendance)
is already solved without touching the schema — `capacity-service.ts` and
`waitlist-service.ts` read from both tables and present one unified
view, which is the cheaper fix for the same symptom.

**What did change incidentally, not as part of a broader redesign:**
- `companyMembers.userId` made unique (`COMPANY-001`, fixed) — a real
  constraint the business rule needed, not a structural rewrite.
- Indexes added (`classes.startsAt`, `bookings.classId`) for query
  performance — additive, no shape change.

**What a future pass could do differently, if this constraint didn't
exist:** the `checkins.bookingId`-only-references-personal-bookings
issue (`CORP-004`) and the missing corporate revenue ledger (`ADMIN-002`)
both have schema-level fixes plan.md itself sketches (a
`bookingSource` + two nullable FK columns on `checkins`; a
`company_credit_transactions` table) — deliberately not attempted here,
consistent with this decision.
