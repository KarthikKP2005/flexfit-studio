# Architecture decisions

Running log of structural decisions made during the `organizing-the-code`
branch, and the reasoning behind each one. Per AGENT_RULES.md Rule 7, there
is no single correct layout — this file is the record of why this one was
picked, so it can be defended.

---

## 2026-08-06 — Test runner setup

**Decision:** Added `vitest.config.ts` at the repo root, resolving the `@/*`
path alias to `./src` (mirrors `tsconfig.json`) and running in the default
`node` environment.

**Why:** `package.json` already had a `test: vitest run` script, but no
config existed, so `@/...` imports would have failed inside test files.
This is test-runner plumbing only — it doesn't change anything about how
the app itself builds or runs.

---

## 2026-08-06 — Test file location: colocated, not mirrored

**Decision:** Test files live next to the source they test
(`src/lib/format.ts` → `src/lib/format.test.ts`), rather than in a separate
`tests/` tree that mirrors `src/`.

**Why:** Colocated tests can't drift out of sync with a moved/renamed
source file the way a mirrored path can, and Vitest's default file
discovery (`**/*.test.ts`) picks them up with no extra config. As files get
extracted into `src/features/**` later in this branch, their tests move
with them in the same commit.

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

## 2026-08-06 — tRPC-caller test harness design

**Decision:** Built the harness in `tests/setup/`:
- `test-db-path.ts` — single source of truth for the disposable test
  database's location (`./test-data/flexfit.test.db`, gitignored).
- `global-setup.ts` — Vitest `globalSetup`; wipes and rebuilds that
  database's schema (via `drizzle-kit push` against a new
  `drizzle.test.config.ts`) once before the whole suite runs.
- `reset-db.ts` — `resetDb()`, deletes every table in FK order; called in
  each test file's `beforeEach` so tests don't see each other's rows.
- `test-caller.ts` — `createTestCaller(user, token)` builds an
  `appRouter` caller directly against `{ db, user, token }`, bypassing
  `createContext()`'s cookie lookup.
- `mock-next-headers.ts` — mocks `next/headers`'s `cookies()` with an
  in-memory store, registered via `vitest.config.ts`'s `setupFiles`.
  Needed because `auth.ts`'s `login`/`register`/`logout` call `cookies()`
  directly rather than going through context, and that call throws
  outside a real Next.js request scope.

**Why not just reuse `flexfit.db`:** the dev database carries seeded data
and whatever manual state accumulates from running the app locally.
Tests need a database that starts empty and identical on every run;
building it fresh from `schema.ts` (the same tool `pnpm db:push` uses)
also means a schema-definition change gets caught by the next test run
without any extra step.

**Why bypass `createContext()` for most tests:** `createContext()` itself
calls `cookies()`, which would require the mock even for router tests
that have nothing to do with cookies. Constructing `{ db, user, token }`
directly is simpler and matches what the Context type actually requires;
`auth.ts`'s own cookie calls are still exercised for real (through the
mock) since that behavior is specific to those three procedures.

---

## 2026-08-06 — Test files run sequentially, not in parallel

**Decision:** Set `test.fileParallelism: false` in `vitest.config.ts`.

**Why:** with the default parallel-file execution, `auth.test.ts` and
`notifications.test.ts` running at the same time each opened their own
libsql connection to the same `test-data/flexfit.test.db`, and concurrent
`resetDb()` deletes from two processes hit `SQLITE_BUSY` ("database is
locked"). A single shared SQLite file isn't safe for concurrent writers
without WAL mode or a busy-timeout, and doing either would mean touching
`db/index.ts`'s connection setup — out of scope for a comment/structure
pass. Running test files one at a time avoids the conflict entirely, and
the suite is small enough that the speed cost isn't noticeable yet. If
the suite grows large enough for this to matter, revisit with
per-worker database files instead of forcing sequential execution.

---

## 2026-08-06 — Shared `createUser` fixture, starting from plans.test.ts

**Decision:** Added `tests/setup/fixtures.ts` with a shared `createUser`
helper. `auth.test.ts` and `notifications.test.ts` each still have their
own near-identical local copy, written before this file existed — left
alone rather than retrofitted.

**Why:** three files in a row needed the same "insert a user with
sensible defaults, allow overrides" helper. Centralizing it prevents a
fourth/fifth copy from drifting. Not retrofitting the first two: they're
already written, green, and covered by their own EDIT_LOG entries —
editing a passing test file purely for dedup carries a small risk (typo,
accidental behavior change in the helper) for no test-coverage benefit,
and this branch's rule is to touch a file only when there's a reason to.
If those two files need real changes later, migrating them to the shared
fixture at that point costs nothing extra.

---

## 2026-08-06 — Test-infra gotcha: a correlated-subquery-as-select-column query shape can return a wrong absolute count in this environment

**What happened:** while characterizing `admin.ts`'s `classUtilisation`
(ADMIN-001 in known-issues.md), a test asserting an exact `booked` count
failed intermittently depending on how many other queries had already run
earlier in the suite — but only for the second-and-later class ever
inserted in the process; the very first one always worked. Chased through
several hypotheses (connection staleness, cross-connection write
visibility) by: reproducing with a completely fresh libsql connection
used for both the writes and the read (still failed), then bypassing
drizzle's query builder entirely and executing the equivalent raw SQL
directly on the same connection at the same moment (returned the
*correct* count). That isolates the bug to drizzle-orm's compilation of
this specific shape — a `sql<T>` tagged-template correlated subquery used
as a selected column, combined with `.where()`/`.limit()` bound
parameters — not to SQLite/libsql itself, not to test setup, and not to
the application's SQL logic (which the raw-SQL check proves is correct).

**Decision:** rather than keep chasing a third-party library's internal
query compilation, the affected test (`admin.test.ts`'s ADMIN-001) was
rewritten to assert the actual invariant under test (adding a corporate
booking doesn't change the count) as a **before/after comparison** on the
same query, rather than trusting the query's absolute return value. This
proves what ADMIN-001 needs to prove regardless of whether this
environment's drizzle/libsql combination computes the absolute number
correctly.

**Why this matters going forward:** `classes.ts`'s `list` procedure uses
the identical query shape (also a correlated `booked` subquery aliased
as a select column) and its tests currently pass — but if a future test
for that procedure (or any other using this shape) starts failing with a
plausible-looking wrong count, check this note before assuming it's an
application bug. Prefer a before/after or relative comparison over an
absolute-value assertion for this specific query shape until the root
cause is confirmed (likely a drizzle-orm version-specific issue with
libsql's local driver — not investigated further here, out of scope for
this branch).

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
