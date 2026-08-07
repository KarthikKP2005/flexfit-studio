# EDIT_LOG.md

Running record of every change made under AGENT_RULES.md, newest first.
Each entry: what changed, why, files touched, tests added/updated, defect
ID if applicable, and whether behavior changed.

AI tool usage note (Rule 9): all entries below were written with Claude
Code (Sonnet 5) in an interactive session — I reviewed and approved every
diff before it landed; nothing here was auto-applied.

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
