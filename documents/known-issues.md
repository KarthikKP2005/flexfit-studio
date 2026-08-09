# Known issues

Confirmed defects found while reading/commenting the code during the
`organizing-the-code` branch. Nothing here is fixed in this branch — see
AGENT_RULES.md Rule 3: this branch is REFACTOR only (structure + comments,
behavior frozen). Each entry records what "fixed" would mean later, so a
future FIX commit has a clear target and doesn't have to re-discover the
bug from scratch.

Format follows plan.md's suggested defect template.

---

### AUTH-001 — `auth.me` returns the full user row, including `passwordHash`, to the client

**Severity:** Medium (info exposure, not directly exploitable — the hash
is scrypt-derived and salted, but there's no reason a client should ever
receive it)
**Status:** Confirmed from source
**Area:** Authentication
**File:** `src/server/routers/auth.ts` — `me: publicProcedure.query(({ ctx }) => ctx.user)`

**Current behavior:** `ctx.user` is populated in `trpc.ts`'s
`createContext` from a `select({ session, user: users })` join, i.e. the
*entire* `users` row, including `passwordHash`. `auth.me` returns
`ctx.user` unmodified, so every authenticated client receives their own
password hash (salt:derived-key hex) in the `auth.me` response on every
call. `members.byId` (staff-facing) is careful to omit it
(`const { passwordHash: _omit, ...safe } = user;`) — `auth.me` is not.

**Expected invariant:** No procedure should ever serialize
`passwordHash` to a client, authenticated or not.

**Why not fixed here:** This branch is structure-and-comments only
(AGENT_RULES.md Rule 0/3) — narrowing `auth.me`'s return shape is a
behavior change (the tRPC output shape changes) and needs its own FIX
commit with a characterization test proving the old (leaking) shape and a
new test proving the fixed one, per Rule 1.1.

**Reproduction:** see `src/server/routers/auth.test.ts`'s
`auth.me > returns the full ctx.user object, including passwordHash, when
signed in` — passes today, documenting the leak.

**What "fixed" would look like:** `me` omits `passwordHash` the same way
`members.byId` already does, e.g. destructuring it out before returning.

---

### AUTH-002 — No member signup UI (backend `register` had no caller)

**Severity:** Medium (feature gap, not a misbehaving code path — new
members could previously only be created by an admin or via seed data)
**Status:** Fixed on branch `signup-member`
**Area:** Authentication / Member onboarding
**File:** `src/app/signup/page.tsx` (new), `src/app/login/page.tsx`,
`src/components/NavBar.tsx`

**Original behavior:** `auth.ts`'s `register` mutation existed and
worked correctly (creates a `role: "member"` account, rejects a
duplicate email with `CONFLICT`), but no page in `src/app/**` ever
called it — see plan.md's member-flow item #1. The only ways to create a
member account were the admin backend or `seed.ts`.

**Fix:** added `/signup`, a new page composing the *unmodified*
`auth.register` mutation with the existing `auth.login` mutation —
registers the account, then immediately signs in with the same
credentials and redirects to `/dashboard`, since `register` itself never
created a session. Linked from `/login` ("New here? Create an account")
and from `NavBar` (a "Sign up" button next to "Sign in" for signed-out
visitors). Neither `auth.register` nor `auth.login` was changed — same
input schema, same output shape, same error codes/messages, verified via
direct HTTP calls against the running dev server (register → login with
the returned credentials → `auth.me` confirms the session → a second
register with the same email correctly returns `CONFLICT`).

**Not in scope for this fix:** AUTH-001 (passwordHash still returned by
`auth.me`) is untouched and still reproducible from the new page's own
flow — this fix only closes the "no UI" gap, not other auth-related
defects.

---

### NOTIF-001 — `broadcast` sends to deactivated members despite the `activeMembers` variable name

**Severity:** Low (a deactivated user can't sign in to read it, so the
practical impact is limited to whatever channel the notification is
surfaced through)
**Status:** Confirmed from source (also flagged independently in plan.md's
audit, item #34)
**Area:** Notifications
**File:** `src/server/routers/notifications.ts` — `broadcast`

**Current behavior:** The query is `select({id: users.id}).from(users)
.where(eq(users.role, "member"))` — filtered on `role` only. The result is
assigned to a variable named `activeMembers`, but nothing filters on
`users.active`, so a deactivated member (active: false) still receives
the broadcast notification row.

**Expected invariant:** `broadcast` should only notify members who are
actually active, matching what the variable name implies.

**Why not fixed here:** Structure-and-comments-only branch — changing who
receives a broadcast is a behavior change (fewer notification rows
inserted for the same input), needs its own FIX commit and defect-specific
test per Rule 1.1/3.

**Reproduction:** `src/server/routers/notifications.test.ts`'s
`notifications.broadcast > NOTIF-001: includes deactivated members...`

**What "fixed" would look like:** add `eq(users.active, true)` to the
query's `where` alongside the existing role filter.

---

### NOTIF-002 — Waitlist promotions never sent a notification

**Severity:** Medium (a promoted member has no in-app signal that they
now hold a confirmed spot — they'd only find out by checking `/dashboard`
or `/waitlist` themselves)
**Status:** Fixed on branch `notifications-member`
**Area:** Notifications / Booking / Corporate bookings
**File:** `src/server/routers/bookings.ts` — `cancel`;
`src/server/routers/corporate-bookings.ts` — `cancel`

**Original behavior:** the schema defines a `waitlist_promotion`
notification type, but neither promotion flow (personal cancel's
waitlist promotion, corporate cancel's waitlist promotion) ever inserted
one — see plan.md item #35.

**Fix:** one `notifications.insert` added at the end of each existing
`if (next) { ... }` promotion block, for `next.userId`. Nothing above the
insert in either block was changed — the promotion logic (including its
known bugs, BOOK-004 and CORP-001) fires exactly as it did before; the
notification is purely an additive side effect of an already-successful
promotion.

**Not in scope for this fix:** BOOK-004 (promotion doesn't recheck
credits) and CORP-001 (promotion confirms before checking company
credits) are untouched — a member/company can still be promoted into a
booking they can't really afford, and now also gets notified about it.

---

### NOTIF-003 — Class cancellation never sent a notification

**Severity:** Medium (a member whose confirmed booking gets cancelled by
staff has no in-app signal — same practical gap as NOTIF-002)
**Status:** Fixed on branch `notifications-member`
**Area:** Notifications / Classes
**File:** `src/server/routers/classes.ts` — `cancel`

**Original behavior:** the schema defines a `class_cancelled`
notification type; `cancel` marks the class cancelled and cancels its
`booked` bookings but never inserted one — see plan.md item #9/CLASS-004.

**Fix:** the existing `bookings` update now uses `.returning()` (instead
of a bare `.update()`) so the mutation knows which `userId`s were just
affected, then bulk-inserts one `class_cancelled` notification per
affected member. The set of bookings that get cancelled is unchanged —
still `booked` personal bookings only.

**Not in scope for this fix:** this did not expand CLASS-004's scope at
the time — waitlisted personal bookings and all corporate bookings on
the cancelled class were still left completely untouched. CLASS-004 has
since been fixed (see that entry) and closed the rest of this gap; the
notification logic this fix added now lives inside
`class-cancellation-service.ts`'s `cancelClass`, extended to cover every
affected member, not just booked personal ones.

---

### NOTIF-004 — Membership-expiring notifications never fired (no scheduler existed)

**Severity:** Medium (members get no warning before a membership lapses;
staff had to notice manually via `/admin/reports`)
**Status:** Fixed on branch `notifications-member`
**Area:** Notifications / Membership
**File:** `src/server/jobs/membership-expiry.ts` (new), `src/server/cron.ts`
(new), `src/server/routers/admin.ts` (new `runMembershipExpiryCheck`),
`src/app/admin/reports/page.tsx`

**Original behavior:** unlike NOTIF-002/003, there was no existing
mutation call site to hook into — the only related code was
`admin.expiringMemberships`, a read-only query powering the "Expiring in
14 Days" list on `/admin/reports`. Nothing in the app ran on a schedule
at all.

**Fix (a genuine addition, not just wiring up dead plumbing — recorded
here per Rule 8 since the policy had to be designed, not discovered):**
- `server/jobs/membership-expiry.ts`'s `notifyExpiringMemberships()` reuses
  the exact same "active, endDate within 14 days" window as
  `admin.expiringMemberships`, and inserts one `membership_expiring`
  notification per matching member.
- `server/cron.ts` is a **standalone Node process** (`pnpm cron`, run
  separately from `pnpm dev`/`pnpm start`) that schedules that function via
  `node-cron` to run once daily at 08:00. This is a real, working cron —
  it is intentionally *not* wired through Next's `instrumentation.ts`
  server-startup hook. An earlier version of this fix did exactly that,
  and it broke: Next's dev-mode webpack also compiles `instrumentation.ts`
  for the edge runtime, and `node-cron`'s internal `node:crypto` import
  isn't handled there — that failure wasn't cosmetic, it surfaced as a
  500 on unrelated API routes (`auth.login` included), a direct Prime
  Directive violation. Adding `node-cron` to `next.config.mjs`'s
  `serverExternalPackages` (the fix that works for `@libsql/client`)
  didn't help, since that only affects the nodejs bundle target, not the
  edge one Next also builds for `instrumentation.ts`. Running as a plain
  Node script via `tsx` sidesteps Next's bundler entirely, so the problem
  doesn't exist there.
- `admin.runMembershipExpiryCheck` (new admin-only mutation) calls the
  same function on demand, wired to a "Send expiry reminders now" button
  on `/admin/reports` — this is how the job gets tested/verified and used
  without needing `pnpm cron` running, e.g. in this dev environment.

**Chosen policy, stated explicitly (Rule 8):** deduplication is "once per
run," not "once per membership ever" — `notifications` has no
`membershipId` column to check against, and adding one is a schema
change (Rule 1.2) out of scope here. A membership sitting in the 14-day
window gets a fresh reminder every time the job runs — daily via
`pnpm cron`, or immediately (possibly more than once a day) via the
manual button. This is a real limitation, not hidden: documented here
and in `membership-expiry.ts`'s header comment.

**What would still need doing for a production version:** run `pnpm cron`
as a managed background process (systemd/pm2/a platform's worker
dyno — whatever the deployment target supports), move the fixed 08:00
schedule to a config value, and add real dedup (a `membershipId` on
`notifications`, or a separate "last notified" table) if daily re-sends
turn out to be unwanted.

---

### PLAN-001 — `subscribe` allows unlimited simultaneous active memberships

**Severity:** Medium (no data corruption, but downstream code that
assumes "one active membership per user" becomes ambiguous — e.g.
MEMBER-002's "latest endDate wins" resolution and `bookings.ts`'s
separate active-membership lookup can each pick a different row)
**Status:** Fixed on branch `fix/plan-001-reject-duplicate-subscription`
**Area:** Membership
**File:** `src/server/routers/plans.ts` — `subscribe`

**Original behavior:** Inserted a new `status: "active"` membership row
on every call, with no check for an existing active membership for that
user. Calling `subscribe` twice for the same user created two rows both
with `status: "active"`, and two separate `payments` rows (double
charge).

**Policy decision (Rule 8 — this was an explicit choice, not a silent
guess):** plan.md lists four plausible policies (reject / extend / queue
/ stack-with-explicit-charge) and says the choice "should not be guessed
during refactoring." Asked the user directly; **Reject** was chosen and
confirmed before any code was written. Reasoning recorded in
`architecture-decisions.md`'s entry for this fix — in short: it's the
only option that's a pure subtraction of the bad behavior (no new
status values, no credit-combination rules to invent), it matches the
precedent set by COMPANY-001's fix ("one X per user, reject a second"),
and it actually closes the defect rather than relabeling it (unlike
Stack).

**Fix:** `subscribe` now looks up the caller's existing `status:
"active"` membership before inserting a new one; if one exists, throws
`CONFLICT` ("You already have an active membership. Wait for it to end
before subscribing again.") before either the membership or payment
insert happens. `plans.list`, `create`, and `setActive` are unchanged.

**Not in scope for this fix:** renewal/extension is not supported — a
member with an active membership has no self-serve path to subscribe
again before it ends or is cancelled by staff (e.g. via
`payments.refund`). This is a known, deliberate scope boundary, not an
oversight — extending `subscribe` to support renewal would require its
own credit-combination policy decision. PLAN-002 (non-atomic
membership+payment insert) and PLAN-003 (payment reference collisions)
are unrelated and untouched.

**Verified manually** (no test harness in this branch — see the CHORE
removal entry in EDIT_LOG.md) against the dev server: a member with an
existing active membership gets `CONFLICT` on a second `subscribe` call;
after that membership was cancelled (via `payments.refund`, unmodified),
`subscribe` succeeded normally; immediately subscribing again after that
success was correctly rejected too. `tsc --noEmit` and `next build` both
clean.

---

### PLAN-002 — `subscribe`'s membership + payment inserts are not atomic

**Severity:** Low (SQLite/libsql writes rarely fail mid-request, but the
window exists)
**Status:** Fixed on branch `fix/plan-002-003-atomic-subscribe-payment-refs`
**Area:** Membership / Payments
**File:** `src/server/routers/plans.ts` — `subscribe`

**Original behavior:** `db.insert(memberships)...` and
`db.insert(payments)...` were two separate statements, not wrapped in a
transaction. If the second insert threw, the membership row from the
first insert remained committed with no matching payment record.

**Expected invariant:** both inserts succeed or both roll back.

**Fix:** both inserts now run inside a single
`await ctx.db.transaction(async (tx) => { ... })`, using `tx` (not `ctx.db`)
for both statements. A failure on either insert now rolls both back —
"nothing happened" instead of "orphaned membership." `plans.list`,
`create`, and `setActive` are unchanged.

**Verified manually** (no automated test harness exists anywhere in this
repo currently — no `.test.ts` files, no vitest config — so this follows
the same manual-verification precedent as PLAN-001/PLAN-004) against the
dev server: `subscribe` still returns the membership row and creates a
matching payment on the happy path; `tsc --noEmit` and `next build` both
clean.

---

### PLAN-003 — Payment `reference` can collide across concurrent subscriptions

**Severity:** Low (references are informational, not enforced unique by
the schema — see plan.md's DB-integrity findings, item #22/#24)
**Status:** Fixed on branch `fix/plan-002-003-atomic-subscribe-payment-refs`
**Area:** Payments
**File:** `src/server/routers/plans.ts` — `subscribe`

**Original behavior:** `reference: \`PAY-${Date.now()}\`` — two `subscribe`
calls resolving within the same millisecond produced byte-identical
reference strings. `payments.reference` has no unique constraint, so this
didn't error, it just produced duplicate references.

**Expected invariant:** each payment gets a distinguishable reference.

**Fix:** `reference: \`PAY-${crypto.randomUUID()}\`` — a UUID suffix instead
of the millisecond timestamp, so two subscriptions in the same request
tick can no longer produce identical references. `payments.reference`
still has no DB-level unique constraint (out of scope here — see
DB-integrity findings in plan.md item #43); this fix only removes the
practical collision source, it doesn't add schema-level enforcement.

**Verified manually** (same caveat as PLAN-002 — no test harness exists in
this repo): confirmed two back-to-back `subscribe` calls now produce
distinct `PAY-<uuid>` references; `tsc --noEmit` and `next build` both
clean.

---

### PLAN-004 — `setActive` silently returns `undefined` for a nonexistent plan id

**Severity:** Low
**Status:** Confirmed from source (new finding — not on plan.md's list)
**Area:** Membership plans
**File:** `src/server/routers/plans.ts` — `setActive`

**Current behavior:** `update(...).where(eq(membershipPlans.id, input.id)).returning().get()`
returns `undefined` when no row matches `input.id` — no `TRPCError` is
thrown, unlike most other mutations in the codebase that check for a
missing row and throw `NOT_FOUND` (e.g. `classes.update`,
`admin-companies.updateActive`).

**Expected invariant:** an admin calling `setActive` with a bad id should
get a clear error, not a silent `undefined` response.

**Why not fixed here:** changing the return/error shape for this input is
a behavior change.

**Reproduction:** `src/server/routers/plans.test.ts`'s
`plans.setActive > PLAN-004: silently returns undefined for a nonexistent
plan id, no error thrown`.

**What "fixed" would look like:** match the pattern used elsewhere —
throw `NOT_FOUND` when the updated row comes back empty.

---

### PAY-001 — `refund` cancels the membership but leaves bookings and credits untouched

**Severity:** Medium (member kept classes they were refunded for, and
kept whatever credits they still had)
**Status:** Fixed on branch `fix/pay-001-refund-cancels-bookings`
**Area:** Payments / Membership
**File:** `src/server/routers/payments.ts` — `refund`

**Original behavior:** `refund` set the payment to `status: "refunded"`
and, if the payment had a `membershipId`, set that membership's `status`
to `"cancelled"`. Nothing else changed: existing `bookings` rows made
against that membership stayed `"booked"` (the member could still
attend), and `creditsRemaining` was untouched.

**Policy decision (Rule 8 — this was an explicit choice, not a silent
guess):** plan.md lists several plausible policies (cancel future
bookings / keep them valid / restore or remove credits / remove waitlist
entries) and says explicitly this "should not be guessed during
refactoring." Asked the user directly; chose **cancel dependent
bookings/waitlist entries, leave already-attended bookings alone,
promote freed seats** — the "you didn't pay for it, you don't keep it"
interpretation. Full reasoning in `architecture-decisions.md`.

**Fix:** `refund` now cancels every `booked` or `waitlisted` row under
the refunded membership (`bookings.membershipId`) in addition to
cancelling the membership itself. Each cancelled `booked` (confirmed)
row frees a seat, so it promotes the next eligible waitlisted candidate
for that class via the existing shared `promoteNextWaitlisted` (same
logic `bookings.cancel` already uses) — no new promotion logic invented.
`creditsRemaining` on the membership is deliberately left untouched: it's
moot once the membership is `cancelled`, since `getCurrentMembership`
(MEMBER-002/MEMBER-006, both fixed) never selects a cancelled membership
again regardless of its credit balance.

**Verified manually** (no test harness in this branch — see the CHORE
removal entry in EDIT_LOG.md): refunded a seeded member's payment who had
~50 active `booked`/`waitlisted` bookings and 8 already-`attended` ones.
Confirmed: their membership flipped to `null` on `members.profile`; all
`booked`/`waitlisted` bookings became `cancelled`; `classesAttended`
stayed at 8 (unchanged — the fix's `WHERE status IN (booked, waitlisted)`
structurally cannot touch `attended` rows). Separately manufactured a
waitlisted booking for another member on a class the refunded member was
confirmed into, and confirmed that candidate was promoted to `booked`
by the refund's cancellation, exactly as a normal `bookings.cancel`
would promote them. `tsc --noEmit` and `next build` both clean.

**Not in scope for this fix:** corporate bookings are untouched —
`payments.membershipId` only ever links to a personal `memberships` row,
never a company's credit pool, so a membership refund has nothing
corporate to reconcile. `markPaid` is unrelated and untouched.

---

### MEMBER-001 — `lookupByEmailOrPhone` can return an arbitrary match when several members share a substring

**Severity:** Medium (kiosk-facing — front desk could check in / act on the
wrong member)
**Status:** Confirmed from source (also flagged in plan.md, item #26)
**Area:** Front desk / Members
**File:** `src/server/routers/members.ts` — `lookupByEmailOrPhone`

**Current behavior:** Wildcard `LIKE` on both `email` and `phone`, no
`ORDER BY`, and `.get()` (single row) — if the search term matches more
than one user, whichever row the database happens to return first is
silently picked, with no indication to the caller that other candidates
existed.

**Expected invariant:** either require an exact/normalized match, or
return every match and let staff choose.

**Why not fixed here:** changes the return shape (single object vs. a
list) — a FIX, not a refactor.

**Reproduction:** `src/server/routers/members.test.ts`'s
`members.lookupByEmailOrPhone > MEMBER-001: with two members sharing a
matching substring, returns an arbitrary single one, not a list`.

**What "fixed" would look like:** per plan.md — exact normalized
email/phone match, or return a list and require staff selection.

---

### MEMBER-002 — `profile` picks the membership with the latest `endDate`, regardless of `status`

**Severity:** Medium (member-facing dashboard could show a
cancelled/expired membership as current, while `bookings.ts`'s
`activeMembershipFor` used a different, status-aware query — the two
could disagree)
**Status:** Fixed on branch `fix/member-002-shared-membership-resolver`
**Area:** Membership
**File:** `src/features/memberships/current-membership.ts` (new),
`src/server/routers/members.ts` — `profile`,
`src/server/routers/bookings.ts` — `book`

**Original behavior:** `profile` used `orderBy(desc(memberships.endDate))`
with no status filter, first row wins. A `cancelled` membership with a
later `endDate` than the user's actually-`active` one was what got shown
as "current" — meanwhile `bookings.ts` had its own separate, stricter
query (`status = "active"` AND `endDate >= today`) for booking
eligibility, so the two could pick different rows for the same user.

**Fix (split into two commits per Rule 3 — refactor and fix are
different acts):**
1. REFACTOR: `bookings.ts`'s private `activeMembershipFor` moved
   verbatim into `src/features/memberships/current-membership.ts` as
   `getCurrentMembership(db, userId)` — no behavior change, `bookings.book`
   calls the exact same query it always did, just relocated.
2. FIX: `members.ts`'s `profile` now calls the same
   `getCurrentMembership` to decide which membership to display, instead
   of its own looser query. `profile`'s output *shape* is unchanged
   (same fields); only *which row* gets returned changes — for any user
   whose latest-`endDate` membership isn't the actually-active one.

**Expected invariant, now enforced:** one single definition of "current
membership" (`status = "active"` AND `endDate >= today`), used
consistently by `profile` (and therefore `/dashboard` and `/profile`,
which both render `members.profile` directly) and `bookings.book`'s
eligibility check.

**Verified manually** (no test harness in this branch — see the CHORE
removal entry in EDIT_LOG.md): reproduced the exact disagreement
scenario against the dev server — cancelled a member's long-`endDate`
membership (via `payments.refund`, unmodified), gave them a new
shorter-`endDate` active one (via `plans.subscribe`), then confirmed
`members.profile` now returns the *active, shorter* membership (not the
cancelled, later-`endDate` one), and that a new `bookings.book` call
attaches to that same membership id — the two no longer disagree.
`tsc --noEmit` and `next build` both clean.

**Not in scope for this fix:** `getCurrentMembership` does not check
`startDate` (plan.md item #21) — carried forward unchanged from
`bookings.ts`'s pre-extraction behavior, not its own known-issues.md
entry yet. `reschedules.ts`'s own copy of this same query is dead code
(never called, already noted as such) and was left untouched. Full
consistency across all six call sites plan.md's MEMBER-002 writeup names
(Profile, Dashboard, Booking, Kiosk, Plan subscription, Admin member
details) was not attempted — Dashboard/Profile are covered automatically
(they render `members.profile`) and Booking already used the correct
definition; Kiosk's and Admin's membership-*history* display
(`members.byId`, a full list, not a single "current" pick) is a
different shape of problem, already flagged separately in kiosk's own
file header comment.

---

### MEMBER-003 — `setActive`/`setRole` silently return `undefined` for a nonexistent user id

**Severity:** Low
**Status:** Confirmed from source (new finding — same shape as PLAN-004)
**Area:** Members
**File:** `src/server/routers/members.ts` — `setActive`, `setRole`

**Current behavior:** both `update(...).where(eq(users.id, input.id)).returning().get()`
with no existence check first — a bad id returns `undefined` rather than
throwing `NOT_FOUND`.

**Expected invariant:** consistent with `members.byId` and most other
mutations in the codebase — a missing row should be a clear error.

**Why not fixed here:** behavior change to the response shape for this
input.

**Reproduction:** `src/server/routers/members.test.ts`'s two
`MEMBER-003:` cases.

**What "fixed" would look like:** same pattern as PLAN-004's fix — throw
`NOT_FOUND` when the updated row comes back empty.

---

### MEMBER-004 — No member-facing UI for editing your own profile

**Severity:** Medium (feature gap, not a misbehaving code path — a
member's name/phone could previously only be changed by an admin, via
`members.setActive`-adjacent staff tooling that doesn't itself exist as
UI either)
**Status:** Fixed on branch `profile-edit-member`
**Area:** Members / Member onboarding
**File:** `src/app/profile/page.tsx` (new), `src/components/NavBar.tsx`

**Original behavior:** `members.ts`'s `updateProfile` mutation existed
and worked correctly (updates the caller's own `name`/`phone`, other
fields untouched), but no page ever called it — see plan.md's
member-flow item #4.

**Fix:** added `/profile`, a new page that loads the caller's own data
via the *unmodified* `members.profile` query and edits `name`/`phone`
via the *unmodified* `members.updateProfile` mutation. Email and role are
shown read-only — `updateProfile`'s input schema only ever accepted
`name`/`phone`, so this page doesn't invent editability for fields the
backend never supported. Linked from `NavBar` by turning the previously
plain `{user.name}` text into a link to `/profile`. On a successful save,
both `members.profile` and `auth.me` are invalidated, since `NavBar`
reads its displayed name from `auth.me`, not `members.profile` — without
invalidating both, a name change wouldn't show up in the header until the
next full page load.

**Not in scope for this fix:** `updateProfile` doesn't support email or
password changes, and this page doesn't add that capability — it only
exposes what the mutation already does. AUTH-001 (passwordHash returned
by `auth.me`) is unrelated and untouched, and is incidentally
reproducible from this page's own `auth.me` invalidation call, same as
it always was.

---

### MEMBER-005 — No admin member-management UI (search/byId/setActive/setRole all backend-only)

**Severity:** Medium (feature gap, not a misbehaving code path — an admin
could not look up a member, view their detail, deactivate them, or
change their role from anywhere in the app)
**Status:** Fixed on branch `admin-members-ui`
**Area:** Members / Admin UI
**File:** `src/app/admin/members/page.tsx` (new), `src/app/admin/page.tsx`

**Original behavior:** all four procedures existed and worked correctly.
`search` was only ever called from the member-picker embedded in
`admin/companies/[id]/page.tsx` (there to link a member to a company,
not to manage members generally). `byId`, `setActive`, and `setRole` had
zero callers anywhere under `src/app/**` — confirmed by grepping for
`members.byId`, `members.setActive`, `members.setRole` across the
frontend. An admin could not look up a member, view their membership
history, deactivate an account, or change a role from anywhere in the
running app.

**Fix:** added `/admin/members`, a new admin-only page: a search bar
calling the *unmodified* `members.search`, a result list, and a detail
panel (`members.byId`) for the selected member showing membership
history plus activate/deactivate and role-change controls wired to the
*unmodified* `members.setActive`/`setRole`. None of the four procedures'
input schemas, output shapes, or error codes changed. Linked from a new
"Members" button on `/admin`'s existing button row, alongside
Companies/Reports/Announcements (same pattern — reachable only from the
admin dashboard, not from `NavBar`).

**MEMBER-003 handled explicitly, not silently:** `setActive`/`setRole`
return `undefined` instead of throwing on a bad id. Verified directly
against the running dev server that this is still true (id `99999`
returns `null`/`undefined`, no error). The new page's mutation handlers
check the returned row before treating the change as applied and show an
inline error if it comes back empty — a defensive check in the new UI
code, not a fix to MEMBER-003 itself, which is untouched.

**Not in scope for this fix:** MEMBER-001 (arbitrary-match lookup) and
MEMBER-002 (latest-endDate-wins membership resolution) are unrelated
procedures and untouched. `search`'s own behavior (matches any role, not
just "member"; empty query returns everyone up to the default limit) is
surfaced as-is — the new page doesn't restrict results to `role:
"member"` since the backend doesn't either, and admins reasonably need
to find trainers/other admins here too (e.g. to demote one).

---

### MEMBER-006 — `getCurrentMembership` does not check `startDate`

**Severity:** Low (no reproduction path existed in the running app —
`plans.subscribe` always creates memberships with `startDate: today`, so
a future-dated membership could previously only exist via direct DB
manipulation or a not-yet-built admin membership-creation UI; this was a
latent gap, not an actively exploitable one)
**Status:** Fixed on branch `fix/member-006-membership-startdate-check`
**Area:** Membership
**File:** `src/features/memberships/current-membership.ts` — `getCurrentMembership`

**Original behavior:** the `where` clause checked `status = "active"`
and `endDate >= today`, but never `startDate <= today`. A membership
whose `startDate` was in the future would still be picked as the
caller's current membership — usable for booking (`bookings.book`) and
shown as current on `/dashboard`/`/profile` (`members.profile`) —
before it was actually supposed to start.

**Fix:** added `startDate <= today` to `getCurrentMembership`'s `where`
clause. Because both `bookings.book` and `members.profile` already call
this one shared function (MEMBER-002, fixed), the fix landed in one
place and both call sites picked it up automatically — no other file
needed a logic change.

**Verified manually** (no test harness in this branch — see the CHORE
removal entry in EDIT_LOG.md): since no UI path can create a
future-dated membership, inserted one directly into the dev database
(`userId: 10`, `startDate` 12 days out, `status: "active"`) for a member
with no other active membership. Confirmed `members.profile` returned
`membership: null` (not the future one), and `bookings.book` rejected
with `FORBIDDEN`/"An active membership is required to book classes."
Also confirmed no regression: a different member's normal,
already-started active membership still resolved correctly on both call
sites. `tsc --noEmit` and `next build` both clean. Test data was deleted
afterward.

**Not in scope for this fix:** `plans.subscribe` itself still doesn't
accept or set a future `startDate` (it's hardcoded to `today`) — this
fix only corrects `getCurrentMembership`'s eligibility check for
whenever such a row exists, by any means.

---

### TRAINER-001 — `setAvailability` accepts any string as a time, with no range validation

**Severity:** Low
**Status:** Confirmed from source (also flagged in plan.md, item #29)
**Area:** Trainer scheduling
**File:** `src/server/routers/trainers.ts` — `setAvailability`

**Current behavior:** `startTime`/`endTime` are `z.string()` with no
format constraint — any string is accepted, including a value that isn't
`HH:mm`, or an `endTime` before `startTime`.

**Reproduction:** `src/server/routers/trainers.test.ts`'s
`TRAINER-001: accepts a nonsense time string...`

**Why not fixed here / what "fixed" would look like:** per plan.md — a
regex-constrained zod schema plus a `startTime < endTime` check. A
validation change is a behavior change (new rejections for previously
accepted input), so it's a FIX, not a refactor.

---

### TRAINER-002 — Availability is checked against UTC day/hour, not a trainer's local time

**Severity:** Medium (a trainer's intended "Sunday morning" availability
can silently fail to match depending on the server's UTC offset from
whatever timezone the trainer was thinking in)
**Status:** Confirmed from source (also flagged in plan.md, item #30)
**Area:** Trainer scheduling
**File:** `src/server/routers/trainers.ts` — `checkAvailability`

**Current behavior:** `getUTCDay()`/`getUTCHours()`/`getUTCMinutes()` are
used to derive the day-of-week and clock time to compare against
`trainerAvailability.dayOfWeek`/`startTime`/`endTime`. There is no
business-timezone concept — availability rows are implicitly UTC.

**Reproduction:** `src/server/routers/trainers.test.ts`'s
`TRAINER-002: the day-of-week check uses UTC, not the trainer's local
time` — deliberately picks a UTC timestamp that falls on a different
calendar day in IST (UTC+5:30) to make the mismatch deterministic
regardless of the machine running the test.

**Why not fixed here / what "fixed" would look like:** per plan.md — a
single defined business timezone used consistently across booking
cutoffs, trainer availability, reports, and display. This is a
cross-cutting change (also touches `bookings.ts`/`reschedules.ts`'s
`hoursUntil` and `src/lib/format.ts`'s display formatting), not a local fix.

---

### CLASS-001 — `byId` is public but returns the full roster (member names + emails)

**Severity:** High (unauthenticated info exposure — anyone who can guess
or enumerate a class id gets every attendee's name and email)
**Status:** Fixed on branch `class-roster-privacy-member` (also flagged
in plan.md, item #10, and plan.md's member-flow item #15)
**Area:** Classes / Security
**File:** `src/server/routers/classes.ts` — `publicById` (renamed from
`byId`)

**Original behavior:** `byId` was `publicProcedure`, and its response
included `roster: [{bookingId, status, memberName, memberEmail}]` for
every booking on that class — no sign-in required. Confirmed `byId` was
never called from any frontend page, so this was a pure backend
liability with zero legitimate current consumer.

**Fix — exactly plan.md's required design, verified against what already
exists rather than duplicated:** `byId` renamed to `publicById` (matching
plan.md's own naming), still `publicProcedure`, now returns the class
row only — no roster field at all. No new `classes.rosterFor` was
added: `bookings.rosterFor` (already `staffProcedure`) already returns
the identical `bookingId`/`status`/`memberName`/`memberEmail` shape for
personal bookings, and `corporateBookings.rosterFor` already covers the
corporate side — `byId`'s old roster only ever queried personal
`bookings` anyway, so nothing is lost. Adding a third near-duplicate
roster query would have been exactly the "repeated logic in four places"
the brief asks to avoid.

**Verified live:** manual E2E against the running dev server (no
automated test harness exists on this branch). Called `classes.
publicById` with no session cookie at all — confirmed the response
contains only class fields, no `roster` key anywhere. Confirmed the old
`classes.byId` path no longer resolves (`NOT_FOUND`, "No procedure
found on path"). Confirmed `bookings.rosterFor` still returns full
attendee names/emails for staff (admin cookie) — unchanged — and still
correctly rejects an unauthenticated caller with `UNAUTHORIZED`/"Sign in
required." `tsc --noEmit` and `pnpm build` both clean.

---

### CLASS-002 — `update` allows capacity below the current confirmed booking count

**Severity:** Medium
**Status:** Confirmed from source (also flagged in plan.md, item #32)
**Area:** Classes
**File:** `src/server/routers/classes.ts` — `update`

**Current behavior:** `capacity` is accepted and applied with no check
against how many `booked` rows already exist for the class — a class with
2 confirmed bookings can have its capacity set to 1 (or 0) without error.

**Reproduction:** `src/server/routers/classes.test.ts`'s
`classes.update > CLASS-002: capacity can be reduced below the number of
already-confirmed bookings`.

**Why not fixed here / what "fixed" would look like:** per plan.md —
reject a capacity below combined confirmed occupancy, or require an
explicit documented override.

---

### CLASS-003 — `create`'s `trainerId` is not validated as an existing, active trainer

**Severity:** Low
**Status:** Confirmed from source (also flagged in plan.md, item #33)
**Area:** Classes
**File:** `src/server/routers/classes.ts` — `create`

**Current behavior:** any number is accepted as `trainerId`, including
one that belongs to a member (not a trainer) or doesn't exist at all
(the FK constraint on `classes.trainerId` would only reject a truly
nonexistent user id, not a wrong-role one).

**Reproduction:** `src/server/routers/classes.test.ts`'s
`classes.create > CLASS-003: accepts a trainerId that belongs to a
non-trainer user...`

**Why not fixed here / what "fixed" would look like:** per plan.md —
validate the referenced user exists, is active, and has role "trainer"
before assigning.

---

### CLASS-004 — `cancel` only cancels confirmed normal bookings; waitlisted entries, corporate bookings, credits, and notifications are all left untouched

**Severity:** High (member-facing — someone waitlisted for a cancelled
class was never told, and a corporate attendee's booking silently
survived a class that no longer exists)
**Status:** Fixed on branch `class-cancellation-cleanup-member` (also
flagged in plan.md's critical list, item 9, and plan.md's member-flow
item #14)
**Area:** Classes / Corporate bookings / Notifications
**File:** `src/features/bookings/class-cancellation-service.ts` (new) —
`cancelClass`; `src/server/routers/classes.ts` — `cancel` (now a thin
wrapper around it)

**Original behavior:** set `classes.cancelled = true`, then only updated
`bookings` rows with `status = "booked"` to `"cancelled"`. Did not: touch
`waitlisted` bookings, touch `corporateBookings` at all (any status),
restore any membership credit, or restore any company credit pool.
(NOTIF-003, fixed separately and earlier, had already closed the
narrower "no notification at all" gap for the one case that *was*
handled — booked personal bookings — but explicitly deferred everyone
else to this fix.)

**Fix — new `cancelClass(db, classId)` service, per plan.md's own
required design** (marks the class cancelled → cancels all active
normal and corporate bookings → restores credits where applicable →
notifies affected members → returns a structured summary): cancels
every still-`booked`-or-`waitlisted` row in **both** `bookings` and
`corporateBookings` for the class, refunds credits for every one that
had actually paid, and sends a `class_cancelled` notification to every
affected member — personal and corporate, previously-booked and
previously-waitlisted alike. `classes.ts`'s `cancel` is now a thin
wrapper (Rule 7) that just calls this and shapes the response;
`classes.ts`'s own file header and `cancel`'s doc comment were updated
to match.

**Refund policy — Rule 8 decision (plan.md doesn't specify a time
window here, and none existed in this code path before this fix):**
every cancelled `booked` booking with `creditsUsed > 0` is refunded in
**full, unconditionally** — no `FREE_CANCELLATION_HOURS` /
`CORPORATE_FREE_CANCELLATION_HOURS` check, unlike `bookings.ts`'s /
`corporate-bookings.ts`'s own member-initiated `cancel`. Those windows
exist to discourage a *member* from bailing late on their own choice;
here the *studio* cancelled the class, so there's no late-notice
behavior to discourage — applying that window would just penalize the
member for a decision that wasn't theirs. `waitlisted` bookings always
have `creditsUsed: 0` (BOOK-004/RESCH-002, both already fixed), so
refunding them is always a no-op — matching plan.md's own required
design ("Marks waitlisted entries cancelled without credit refunds")
without any special-casing needed.

**Not changed / still open:** the check-then-write race this shares with
every other multi-step booking flow (plan.md item 44, "no transactions")
is untouched — same, already-documented, broader gap.

**Verified live:** manual E2E against the running dev server with real
seeded accounts (no automated test harness exists on this branch), two
classes covering all four combinations: Class A (capacity 2) — a real
personal `booked` booking (real charge) and a real corporate `booked`
booking (real charge to the company), plus a personal booking that
correctly waitlisted once full; Class B (capacity 1) — an unlimited-plan
personal `booked` booking (never actually decremented) and a corporate
booking that correctly waitlisted once full. Cancelling both classes as
admin confirmed: all 5 bookings across both tables flipped to
`cancelled` (including the two that were `waitlisted` — untouched
before this fix); the personal member's membership and the company's
credit pool were both refunded back to their exact pre-test values; the
unlimited membership was correctly left alone (nothing to refund); and
every one of the 5 affected members received a `class_cancelled`
notification — including the two who were only ever waitlisted, who
got none before this fix. `tsc --noEmit` and `pnpm build` both clean.

---

### ADMIN-001 — `classUtilisation` counts only normal bookings, ignoring corporate bookings on the same class

**Severity:** Medium (utilisation numbers shown to admins undercount real
occupancy for any class with corporate attendees)
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 1, and shares its root cause with CLASS-related
capacity-tracking gaps)
**Area:** Admin reporting
**File:** `src/server/routers/admin.ts` — `classUtilisation`

**Current behavior:** the `booked` count is computed from a subquery
against `bookings` only — `corporateBookings` is never referenced.

**Reproduction:** `src/server/routers/admin.test.ts`'s
`admin.classUtilisation > ADMIN-001: adding a corporate booking to a
class does not change its reported booked count` — see that test file's
header comment for why it asserts "unchanged before/after" rather than a
specific absolute number (a reproducible drizzle-orm/libsql query-shape
quirk in this environment made the absolute count itself unreliable to
assert on directly — confirmed as a driver/tooling artifact, not an
application bug, via a raw-SQL cross-check).

**Why not fixed here / what "fixed" would look like:** per plan.md — a
shared occupancy service counting both booking sources, used consistently
by `classUtilisation`, `classes.list`'s spotsLeft, and the trainer roster.

---

### ADMIN-002 — Revenue reports never include corporate credit top-ups

**Severity:** Low (admin can't audit corporate revenue from these reports)
**Status:** Confirmed from source (also flagged in plan.md, item #47)
**Area:** Admin reporting / Corporate bookings
**File:** `src/server/routers/admin.ts` — `revenueByMonth`, `revenueByMethod`

**Current behavior:** both reports sum `payments` rows only.
`admin-companies.ts`'s `topUp` mutates `companies.creditPoolBalance`
directly with no corresponding `payments` (or any other) row, so that
money movement is invisible to these reports.

**Reproduction:** `src/server/routers/admin.test.ts`'s
`admin.revenueByMonth / revenueByMethod > ADMIN-002: corporate credit
top-ups never appear in revenue, only payments rows do`.

**Why not fixed here / what "fixed" would look like:** per plan.md — a
`company_credit_transactions` ledger table. A schema change, out of scope
for this pass; documenting is the safer choice per plan.md's own
recommendation given the time available.

---

### COMPANY-001 — A member can be linked to more than one company at once

**Severity:** Medium (which company pays for a corporate booking becomes
ambiguous — see `corporate-bookings.ts`'s single-row `.get()` company
lookup)
**Status:** Fixed on branch `fix/company-001-one-company-per-member`
**Area:** Corporate accounts
**File:** `src/db/schema.ts` — `companyMembers`; `src/server/routers/admin-companies.ts` — `linkMember`

**Original behavior:** `linkMember` only rejected an exact duplicate
(same `userId` + `companyId` pair, via CONFLICT) — nothing stopped a
second `linkMember` call linking the same user to a *different*
company. The schema had no unique constraint on `companyMembers.userId`
either, so `corporate-bookings.ts`'s `getCompanyForMember` (a single-row
`.get()` with no ordering) could arbitrarily pick among several active
links for the same user.

**Reproduction (pre-fix):** confirmed by reading the source and by
manually calling `linkMember` twice for the same user against two
different companies on the running dev server — both calls succeeded.

**Fix:** per plan.md's own recommendation — the simpler, safer rule is
one company per member. Added `.unique()` to `companyMembers.userId` in
`schema.ts` (a schema change per Rule 1.2 — see the
`architecture-decisions.md` entry for the reasoning and the drizzle-kit/
libsql push quirk hit while applying it). `linkMember` now checks for
*any* existing link for the user (not just the same-company duplicate)
and rejects it with a clear `CONFLICT` — `"...already linked to a
different company. Unlink them first."` for a different company, or the
original `"...already linked to this company."` message unchanged for
an exact repeat. Verified manually (no test harness in this branch):
link succeeds once, a second link to a different company is rejected, a
repeat link to the same company still gets the original message.

**Not in scope for this fix:** `corporate-bookings.ts`'s
`getCompanyForMember` query itself is unchanged (still a single-row
`.get()` filtered on `companies.active`) — only its comment was
updated, since the ambiguity it described can no longer occur once the
constraint is enforced.

---

### BOOK-004 — Waitlist promotion on cancel does not re-check the promoted member's credit balance

**Severity:** High (a member could be promoted into a paid class while
holding insufficient credits, with their balance silently floored at
zero instead of the promotion being rejected)
**Status:** Fixed on branch `personal-waitlist-credit-member` (also
flagged in plan.md, item #4 — and this is the exact scenario
AGENT_RULES.md's Rule 5 uses as its own worked example for how to
comment a known bug)
**Area:** Booking / Waitlist
**File:** `src/features/bookings/waitlist-service.ts` —
`tryPromotePersonalCandidate`

**Original behavior:** when a confirmed (`booked`) booking was
cancelled, the oldest waitlisted booking for that class was promoted to
`booked` unconditionally — there was no check that the promoted member's
membership still had enough credits. The subsequent balance update used
`Math.max(0, ms.creditsRemaining - row.cls.creditCost)`, which floored
at zero rather than rejecting the promotion or leaving the member on the
waitlist.

**Fix — same Rule 8 policy already chosen for CORP-001 (its exact
sibling bug on the corporate side), reused here rather than re-decided
for consistency:** credits are now verified BEFORE promoting. On
insufficient credits, the candidate is **skipped** (left waitlisted, not
promoted) and the next-oldest remaining candidate across *either*
waitlist is tried instead — not "stop and leave waitlisted," for the
same reason as CORP-001: that would let one under-funded member block
every eligible person behind them, personal or corporate. Since
eligibility is now confirmed before the deduction ever runs, the
`Math.max(0, ...)` floor is gone entirely — a plain subtraction can't go
negative once the check has already passed, so the floor was never
actually a fix, just a symptom of the missing one.

**Not changed:** a booking with no `membershipId`, or one whose
membership row can no longer be found, is still treated as eligible —
matching the original code, which never blocked promotion on either
condition either; that's a separate, narrower edge case outside this
defect's scope.

**Verified live** (manual E2E, mirroring CORP-001's exact test with
roles swapped): a personal candidate with a real, limited membership
joined a waitlist while they could afford the class; their credits were
then spent down via a second real booking so they could no longer afford
it by promotion time. A newer corporate candidate joined the same
waitlist. Cancelling the confirmed booking correctly **skipped** the
now-ineligible personal candidate (stayed waitlisted, membership balance
unchanged, no notification) and promoted the corporate candidate
instead. `tsc --noEmit` and `pnpm build` both clean.

---

### CORP-001 — Corporate waitlist promotion confirms the booking before checking whether the company can afford it

**Severity:** High (a company could end up with a confirmed, unpaid
corporate booking)
**Status:** Fixed on branch `corporate-waitlist-credit-member` (also
flagged in plan.md's critical list, item 3)
**Area:** Corporate bookings / Waitlist
**File:** `src/features/bookings/waitlist-service.ts` —
`tryPromoteCorporateCandidate`

**Original behavior:** the promotion block set the waitlisted booking's
`status` to `"booked"` (and `creditsUsed` to the class's cost)
unconditionally. Only *after* that did it check
`company.creditPoolBalance >= creditCost` before deducting — if the
check failed, the deduction was simply skipped, but the booking stayed
confirmed. The company never paid for a class it couldn't afford.

**Fix — chosen policy stated explicitly (Rule 8, per plan.md's own
framing that this "must be documented because the current expected
behaviour is not defined"):** order is now load company → verify credits
→ deduct → promote. On insufficient credits, plan.md offered two
options — skip to the next candidate, or leave this one waitlisted and
stop. **Chose "skip to the next candidate."** Reasoning: the alternative
(stop entirely) would let one under-funded company permanently block
every *eligible* candidate behind them in the queue, personal or
corporate — a new fairness problem, and arguably worse than the original
bug. `promoteNextWaitlisted` (CORP-003's shared queue) now walks the full
merged personal+corporate waitlist oldest-first; an ineligible corporate
candidate is left waitlisted and the walk continues to the next-oldest
entry instead of stopping.

**Not wrapped in a transaction** — plan.md also asks for that, but it's
the same broader, already-documented "no transactions" finding this
fix doesn't attempt to close (plan.md item 44); this commit fixes the
*ordering* bug (verify-then-promote instead of promote-then-verify), not
the check-then-write race, which is unchanged from before.

**BOOK-004 unaffected:** a personal candidate is still promoted
unconditionally with no credit recheck — this fix only changes the
corporate branch's eligibility check.

**Verified live:** a corporate candidate joined a waitlist while their
company could afford the class; the company's balance was then spent
down elsewhere (a second, real corporate booking) so they could no
longer afford it by promotion time. A newer personal candidate also
joined the same waitlist. Cancelling the confirmed booking correctly
**skipped** the now-ineligible corporate candidate (still waitlisted, no
free booking, company balance unchanged) and promoted the personal
candidate instead. `tsc --noEmit` and `pnpm build` both clean.

---

### KIOSK-001 — Kiosk wrongly blocked check-in for a member at zero credits

**Severity:** Medium (member-facing — front desk staff physically could
not check in a member who had already paid for and confirmed the exact
class they were standing in front of, if that booking spent their last
credit)
**Status:** Fixed on branch `fix/kiosk-001-zero-credits-checkin`
**Area:** Kiosk / Frontend
**File:** `src/app/kiosk/page.tsx`

**Original behavior:** `hasNoCredits` (computed from
`memberDetails.data.memberships[0].creditsRemaining === 0`) was included
in the Check-in button's `disabled` condition — see plan.md item #25 (role
list item #26). Credits are spent at *booking* time (`bookings.book`
deducts them when the booking is created), not at check-in time — so a
member who booked a class with their last remaining credit already holds
a valid, confirmed booking; their credit balance being zero afterward
says nothing about whether that specific booking is legitimate.

**Server-side check (unchanged, already correct):** `bookings.ts`'s
`markAttended` never checked credits — only `booking.status === "booked"`
and the 30-minutes-before-to-end-of-class check-in window. So the bug
was purely a client-side false block; nothing server-side needed to
change, and no tRPC procedure's input/output/error shape changed.

**Fix:** removed `hasNoCredits` from the button's `disabled` list. The
button now disables only on `markAttended.isPending` or
`isMembershipExpired`. The "⚠ No credits remaining" banner is unchanged
and still displays — it's informational only now, not a gate.

**Not in scope for this fix:** `isMembershipExpired` still disables the
button, untouched — whether an *expired* membership should also be
allowed to check into a booking made while it was still active is a
separate, undecided question (not what plan.md item #25/role-list #26
asked about), left alone per Rule 8 rather than guessed. Also untouched:
`hasNoCredits`/`isMembershipExpired` are still computed from
`memberships[0]` (most-recent-startDate, not necessarily the active
one) — the same MEMBER-002-shaped gap noted in the file's existing
header comment, out of scope here since it affects which membership is
looked at, not whether credits should gate check-in at all.

**Verification:** traced `markAttended`'s server-side checks directly
(`src/server/routers/bookings.ts:314-353`) — confirms it only checks
booking status and the check-in window, never credits, so removing the
client-side credit gate doesn't let the UI diverge from what the server
already allows. `tsc --noEmit` shows no new errors.

---

### CORP-002 — Corporate booking capacity is judged independently of personal bookings on the same class

**Severity:** High (a class could be overbooked: full on personal
bookings, then further overbooked by corporate bookings, or vice versa)
**Status:** Fixed on branch `booking-capacity-member` (also flagged in
plan.md's critical list, item 1 — the corporate side of the same finding
`bookings.ts` exhibited from the personal side)
**Area:** Corporate bookings / Booking / Rescheduling / Capacity
**File:** `src/features/bookings/capacity-service.ts` (new),
`src/server/routers/bookings.ts` — `book`,
`src/server/routers/corporate-bookings.ts` — `book`,
`src/server/routers/reschedules.ts` — `reschedule` and `validateReschedule`

**Original behavior:** `corporateBookings.book`'s `isFull` check counted
only `corporateBookings` rows for the class, never `bookings`. Mirrored
from the personal side: `bookings.book`'s `isFull` counted only
`bookings`, never `corporateBookings`. `reschedules.ts`'s `reschedule`
and `validateReschedule` each independently ran the same personal-only
count a third and fourth time. A class already at capacity from one
booking source would still accept a confirmed booking (or a confirmed
reschedule target) from the other.

**Fix:** one shared `isClassFull(db, classId, capacity)` in the new
`src/features/bookings/capacity-service.ts` (the exact filename
AGENT_RULES.md Rule 7 uses as its own worked example), counting confirmed
occupancy from both `bookings` and `corporateBookings`. All four
independent inline counts (`bookings.book`, `corporateBookings.book`,
`reschedules.reschedule`, `reschedules.validateReschedule`) now call it
instead. No output shape, error code, or message changed anywhere — only
the truth value `isFull`/`targetIsFull` feeds into the same existing
booked-vs-waitlisted branching.

**Verified live** (manual E2E against the dev server, real seed
accounts): filled a capacity-1 class with a personal booking, then
attempted a corporate booking on the same class → correctly waitlisted
(previously would have wrongly confirmed). Reverse direction (corporate
fills, personal attempts) → correctly waitlisted. Rescheduled into a
different capacity-1 class already filled via the other booking source →
`validateReschedule` correctly previewed `targetIsFull: true` and the
actual `reschedule` mutation correctly waitlisted, matching the preview.
`tsc --noEmit` and `pnpm build` both clean.

**Explicitly not touched by this fix — still open:**
- `classes.list`'s `spotsLeft`/`full` (the public `/schedule` display)
  still counts personal bookings only. This is a **display accuracy**
  gap, not an overbooking gap — the fix above prevents overbooking
  regardless of what the display shows — but it means `/schedule` can
  now look slightly more out of sync with real booking outcomes than
  before (shows "spots available" when the other booking source already
  filled the class and a personal booker would actually get waitlisted).
  Pre-existing, not introduced by this fix.
- `admin.classUtilisation` — already tracked separately as **ADMIN-001**,
  untouched here.
- Trainer roster booked-counts (`/trainer/schedule`) — same root cause,
  no formal defect ID yet; noted here as remaining follow-up work.
- The check-then-insert race between `isClassFull`'s read and the
  caller's subsequent insert is unchanged — a still-open, broader,
  already-documented gap (plan.md's "no transactions" findings), not
  made worse by this fix (the original single-table checks had the exact
  same race).

---

### CORP-003 — Corporate and personal waitlists never coordinate

**Severity:** Medium (a personal member could wait indefinitely behind a
corporate booking's cancellation, or vice versa, regardless of who'd
actually been waiting longer)
**Status:** Fixed on branch `waitlist-coordination-member` (also
flagged in plan.md's critical list, item 2)
**Area:** Corporate bookings / Booking / Waitlist
**File:** `src/features/bookings/waitlist-service.ts` (new),
`src/server/routers/bookings.ts` — `cancel`,
`src/server/routers/corporate-bookings.ts` — `cancel`

**Original behavior:** cancelling a corporate booking only ever looked
at `corporateBookings` for a waitlisted candidate to promote; cancelling
a personal booking only ever looked at `bookings`. There was no single
chronological queue across both — an older candidate on one waitlist
could be skipped in favor of a newer candidate on the other, purely
because of which table the freed seat happened to come from.

**Fix:** one shared `promoteNextWaitlisted(db, cls)` in the new
`src/features/bookings/waitlist-service.ts` (the exact filename
AGENT_RULES.md Rule 7 uses as its own worked example alongside
`capacity-service.ts`, CORP-002's fix). It reads the oldest waiting row
from *both* `bookings` and `corporateBookings`, compares their
`bookedAt` timestamps, and promotes whichever is genuinely older — using
that source's own existing promotion mechanics unchanged once selected.
Both `bookings.ts`'s `cancel` and `corporate-bookings.ts`'s `cancel` now
call this one function instead of each running their own table-only
promotion query (this also happened to collapse ~50 near-duplicate lines
in each file into one call, directly answering the brief's "pull
repeated logic into one place instead of four").

**Not in scope for this fix — explicitly untouched:**
- **BOOK-004** (personal promotion never rechecks the candidate's
  credits, floors at zero with `Math.max` instead of rejecting) —
  same bug, can now happen to a promoted candidate from either source.
- **CORP-001** (corporate promotion confirms the booking before checking
  whether the company can afford it) — same bug, unchanged.
- Atomic/transactional promotion (check + two writes + notification, not
  wrapped in a transaction) — separate, already-documented, broader "no
  transactions" finding (plan.md item 44).
- RESCH-003 (reschedule frees a seat but never triggers *any*
  promotion) — `promoteNextWaitlisted` was already available as natural
  follow-up work here, and was later wired in when RESCH-003 itself was
  fixed. CLASS-004 (class cancellation) turned out **not** to need it
  when it was fixed, on inspection: cancelling a class cancels its
  entire waitlist too (there's no seat left over to promote anyone
  into), unlike a reschedule or a normal cancel, which only ever moves
  or frees a single seat while the rest of the class stays open.

**Verified live** (manual E2E, real seeded/company-linked accounts,
both directions): filled a capacity-1 class personally, queued a
*corporate* candidate, then — after a real time gap — queued a *newer
personal* candidate; cancelling the personal booking correctly promoted
the older corporate candidate, not the newer personal one (confirmed via
`corporateBookings.mine`/`bookings.mine`, plus the promotion
notification landing on the right account). Repeated with the sources
reversed (corporate booking cancelled, older personal candidate queued
first) — correctly promoted the older personal candidate over a newer
corporate one. `tsc --noEmit` and `pnpm build` both clean.

---

### CORP-004 — Corporate check-ins can never reference their corporate booking

**Severity:** Low (reporting gap, not a functional break)
**Status:** Confirmed from source (also flagged in plan.md, item #15)
**Area:** Corporate bookings / Attendance
**File:** `src/server/routers/corporate-bookings.ts` — `markAttended`

**Current behavior:** `checkins.bookingId` only foreign-keys to
`bookings` (personal). `markAttended` here always inserts
`bookingId: null`, so a corporate check-in row exists but can't be traced
back to the corporate booking it belongs to.

**Reproduction:** `src/server/routers/corporate-bookings.test.ts`'s
`corporateBookings.markAttended > ... CORP-004: the checkin's bookingId
is always null`.

**Why not fixed here / what "fixed" would look like:** per plan.md — a
schema change (either a `bookingSource` + two nullable FK columns on
`checkins`, or separate `membershipBookingId`/`corporateBookingId`
columns), needing a migration — out of scope for this pass.

---

### CORP-005 — No member-facing UI for corporate booking (schedule always called personal `bookings.book`)

**Severity:** Medium (feature gap, not a misbehaving code path — a
company-linked member could not spend their employer's credit pool from
anywhere in the app)
**Status:** Fixed on branch `corporate-booking-member`
**Area:** Corporate bookings / Member UI
**File:** `src/app/schedule/page.tsx`, `src/app/dashboard/page.tsx`,
`src/server/routers/corporate-bookings.ts` (new `myCompany` query)

**Original behavior:** `corporate-bookings.ts`'s `book`/`cancel`/`mine`
worked correctly and were structurally parallel to the personal booking
flow, but no page under `src/app/**` ever called them — `/schedule`
always booked through personal `bookings.book`, and `/dashboard` never
queried `corporateBookings.mine` — see plan.md's member-flow item #2.

**Fix:** `/schedule`'s book button now offers an explicit personal-vs-
company credit choice (expands on hover/click, per plan.md's own note
not to silently pick a credit source) for members linked to an active
company, calling the *unmodified* `corporateBookings.book`. `/dashboard`
gained a "Corporate bookings" section (parallel to "Upcoming bookings")
showing `corporateBookings.mine` with a Cancel action wired to the
*unmodified* `corporateBookings.cancel`. One new read-only query,
`corporateBookings.myCompany`, was added to let the UI know whether the
caller is company-linked at all — it just exposes the existing internal
`getCompanyForMember` helper's result to its own caller, no new business
logic.

**Not in scope for this fix:** CORP-001 (promote-before-charge), CORP-002
(corporate capacity judged independently of personal bookings), CORP-003
(waitlists don't coordinate), and CORP-004 above (check-ins can't
reference corporate bookings) are all untouched and still reproducible
through this new UI — this fix only closes the "no UI" gap, using the
existing (already-buggy) corporate-bookings mutations exactly as they
were. `/schedule`'s `spotsLeft`/`full` still reflect personal bookings
only (see CORP-002) — the new company-credits button does not display a
separate "full" state for the corporate side. Rescheduling a corporate
booking is not supported (`reschedules.ts` only operates on the personal
`bookings` table) — corporate rows on `/dashboard` only get Cancel.

---

### RESCH-001 — Rescheduling a waitlisted booking to an available class produces an unpaid confirmed booking

**Severity:** High
**Status:** Fixed on branch `reschedule-credit-member` (also flagged in
plan.md's critical list, item 5, and plan.md's member-flow item #10)
**Area:** Rescheduling
**File:** `src/server/routers/reschedules.ts` — `reschedule` and
`validateReschedule`

**Original behavior:** the new booking's `creditsUsed` was copied
directly from the original (`creditsUsed: originalBooking.creditsUsed`).
A waitlisted original has `creditsUsed: 0`; if the target class wasn't
full, the new booking was created with `status: "booked"` and
`creditsUsed: 0` — a confirmed seat the member never paid for.

**Fix:** only the `waitlisted → booked` transition was ever missing a
credit check (every other transition already carried the right, already-
paid `creditsUsed` forward). That transition now works exactly like a
fresh `bookings.book` call: the membership behind the original booking
(`originalBooking.membershipId`, not a fresh re-resolve — same approach
as BOOK-004's `tryPromotePersonalCandidate`) is checked against the
*target* class's `creditCost` before confirming. If it can't afford it,
the reschedule is rejected — `FORBIDDEN`, `"Not enough class credits
remaining."` (the exact existing error `bookings.book` already uses for
the same condition, reused rather than inventing new wording). If it
can, the target's `creditCost` is charged and deducted, replacing the
stale copied `0`. `validateReschedule` (the preview used by the
reschedule modal) got the identical check, so it no longer previews a
reschedule as valid that the mutation would then reject.

**Not changed here / still open:** RESCH-003 (reschedule never promotes
the class being left) and RESCH-004 (no reconciliation against the
target class's own `creditCost` for transitions other than the one
above) are untouched — separate defect IDs, separate commits. RESCH-002
(the mirror-image `confirmed → waitlisted` transition) was also open at
the time this fix landed, and has since been fixed too — see that entry
below.

**Verified live:** manual E2E against the running dev server with a
real seeded membership (no automated test harness exists on this
branch). Case A (enough credits): joined a capacity-1 class's waitlist
(0 credits used), rescheduled to a same-named, non-full class costing 5
— confirmed the new booking came back `status: "booked"`,
`creditsUsed: 5` (not the stale 0), and the membership was correctly
decremented by 5. Case B (insufficient credits): repeated the same setup
but drained the membership to 0 credits first via a second real booking
— confirmed both `validateReschedule` (`valid: false`) and `reschedule`
(`FORBIDDEN`/"Not enough class credits remaining.") correctly rejected
it, the original waitlisted booking was untouched, no new booking was
created, and the membership balance stayed at 0 (not further deducted).
`tsc --noEmit` and `pnpm build` both clean.

---

### RESCH-002 — Rescheduling into a full class, then being promoted later, can charge credits twice for one booking

**Severity:** High
**Status:** Fixed on branch `reschedule-double-charge-member` (also
flagged in plan.md's critical list, item 6, and plan.md's member-flow
item #11)
**Area:** Rescheduling / Waitlist
**File:** `src/server/routers/reschedules.ts` — `reschedule` (interacts
with `bookings.ts`'s `cancel` promotion logic and BOOK-004's shared
`tryPromotePersonalCandidate`)

**Original behavior:** rescheduling a paid (`creditsUsed > 0`) booking
into a full target class created a waitlisted booking that kept the
original's nonzero `creditsUsed`. When that booking was later promoted
(via `bookings.ts`'s `cancel`), `creditsUsed` was overwritten to the
target class's cost and the membership was charged again — a second
charge for what was originally one booking.

**Fix — same "waitlisted means unspent" invariant RESCH-001 already
established for the opposite transition, applied here too (per plan.md's
own framing that this needs to be "implemented consistently
everywhere"):** a `booked` original rescheduled into a full target class
is now created `waitlisted` with `creditsUsed: 0` — matching every other
waitlisted booking in the app — and the credits already deducted for the
original booking are refunded back to the membership at reschedule time
(same `UNLIMITED_CREDITS` guard used everywhere else; skipped if the
original had 0 credits used, or its membership can't be resolved). A
later promotion (BOOK-004, fixed) then charges exactly once, correctly,
with no code changes needed there — the fix is entirely in getting
`reschedule`'s own bookkeeping right at the point of transition.

**Not changed here / still open:** RESCH-004 (no reconciliation of
same-named classes with different `creditCost`, for the two transitions
that don't change status) remains untouched — separate defect ID,
separate commit. RESCH-003 (reschedule never promotes the class being
left) was also open at the time this fix landed, and has since been
fixed too — see that entry below.

**Verified live:** manual E2E against the running dev server with real
seeded memberships (no automated test harness exists on this branch).
Booked a class for real (10 credits → 4, a genuine charge). Rescheduled
into a same-named, capacity-1 class that was already full → confirmed
the new booking came back `status: "waitlisted"`, `creditsUsed: 0` (not
the stale 6), and the membership was correctly refunded back to 10.
Then cancelled the booking occupying that full class, triggering
promotion → confirmed the waitlisted booking was promoted to
`status: "booked"`, `creditsUsed: 6`, and the membership ended at
exactly 4 — charged once for the one continuous booking, not twice.
`tsc --noEmit` and `pnpm build` both clean.

---

### RESCH-003 — Rescheduling away from a class never promotes that class's waitlist

**Severity:** Medium
**Status:** Fixed on branch `reschedule-original-waitlist-member` (also
flagged in plan.md's critical list, item 7, and plan.md's member-flow
item #12)
**Area:** Rescheduling / Waitlist
**File:** `src/server/routers/reschedules.ts` — `reschedule`

**Original behavior:** the original booking was cancelled as part of a
reschedule, freeing its seat — but unlike `bookings.ts`'s `cancel`,
`reschedule` never ran any waitlist-promotion logic for the class being
left. Anyone waitlisted for the original class stayed waitlisted forever,
even though a confirmed spot had just opened up.

**Fix — exactly the change plan.md itself names:** after cancelling the
original booking, if it was `booked` (a confirmed seat, matching the
same guard `bookings.ts`'s `cancel` uses — a waitlisted original never
held a seat, so there's nothing to free), `reschedule` now calls the
same shared `promoteNextWaitlisted` (`src/features/bookings/
waitlist-service.ts`) that `bookings.ts`'s and `corporate-bookings.ts`'s
own `cancel` already call (CORP-003/CORP-001/BOOK-004, all previously
fixed). No new policy decision was needed — this reuses the existing,
already-fixed promotion logic unchanged, on the class being left instead
of the class being joined.

**Not changed here:** RESCH-004 (no reconciliation of same-named classes
with different `creditCost`) was also open at the time this fix landed,
and has since been fixed too — see that entry below. All four RESCH
defects on this file are now closed.

**Verified live:** manual E2E against the running dev server with real
seeded accounts (no automated test harness exists on this branch).
Filled a capacity-1 class with one member (confirmed, real charge) and
had a second member join its waitlist. Rescheduled the first member
away to a different, same-named class → confirmed the reschedule
succeeded normally, AND the waitlisted member on the original class was
correctly promoted (`status: "booked"`, correct `creditsUsed`, and a
real `waitlist_promotion` notification — none of which happened before
this fix, when they'd have stayed stuck waitlisted). `tsc --noEmit` and
`pnpm build` both clean.

---

### RESCH-004 — Reschedule copies the original credit cost, ignoring the target class's actual cost

**Severity:** Medium
**Status:** Fixed on branch `reschedule-cost-mismatch-member` (also
flagged in plan.md's critical list, item 8, and plan.md's member-flow
item #13)
**Area:** Rescheduling
**File:** `src/server/routers/reschedules.ts` — `reschedule` and
`validateReschedule`

**Original behavior:** same-named classes are not required to share a
`creditCost` (see the header comment on `classes` in `schema.ts`), but
`reschedule` copied the *original* booking's `creditsUsed` onto the new
booking regardless of what the target class actually cost — for the two
transitions that don't change confirmation status (`booked→booked`,
`waitlisted→waitlisted`); RESCH-001/RESCH-002 already handled the other
two correctly using the target's real cost.

**Fix — plan.md names three possible policies and states its own
recommendation directly:** *"the safest behaviour-preserving option is
initially to validate equal credit cost and document mismatches as a
known issue."* That's the option implemented: `reschedule` now rejects
outright (`BAD_REQUEST`, "You can only reschedule to a class with the
same credit cost.") if the target's `creditCost` doesn't match the
original's — checked once, up front, so it applies uniformly across all
four transitions rather than needing separate handling per transition.
`validateReschedule` got the identical check, so the preview doesn't
show a same-named, different-cost class as reschedulable.

**Deliberately not chosen:** charging/refunding the difference (plan.md's
second option) — more invasive, would need its own new credit-adjustment
logic layered on top of what RESCH-001/RESCH-002 already established,
and plan.md itself calls the reject-on-mismatch option the safer one for
this pass. Scoping reschedules to a class-series entity (plan.md's third
option) would be a schema change, out of scope here.

**Verified live:** manual E2E against the running dev server with a real
seeded membership (no automated test harness exists on this branch).
Case A (mismatched cost): booked a 5-credit class, attempted to
reschedule to a same-named 8-credit class → both `validateReschedule`
(`valid: false`) and `reschedule` (`BAD_REQUEST`/"You can only
reschedule to a class with the same credit cost.") correctly rejected
it, with the original booking completely untouched. Case B (matching
cost): booked a 5-credit class, rescheduled to a same-named 5-credit
class → succeeded exactly as before (`booked → booked`,
`creditsUsed: 5` carried forward). `tsc --noEmit` and `pnpm build` both
clean.

---

### RESCH-005 — Reschedule modal didn't actually exclude the original class from the picker

**Severity:** Medium (member-facing confusion — picking the class you're
already in fails with a confusing server error instead of just not being
offered)
**Status:** Fixed on branch `reschedule-modal-member`
**Area:** Rescheduling / Frontend
**File:** `src/components/reschedule-modal.tsx`, `src/app/dashboard/page.tsx`

**Original behavior:** the modal's own comment claimed the original
class was excluded from the picker, but the filter only checked
`cls.name === fromClassName` — the component was never given the
original class's `id` to compare against, so the original stayed
selectable and picking it failed server-side with "You already have an
active booking for this class." See plan.md item #37.

**Fix:** added a `fromClassId` prop, populated from `bookings.mine`'s
existing `classId` field (already returned, nothing new fetched) at the
one call site (`dashboard/page.tsx`). `sameNameClasses` now filters on
`cls.name === fromClassName && cls.id !== fromClassId`.

**Verification note (see RESCH-006 below):** this could not be verified
by watching the picker render in a live browser — a separate, more
severe pre-existing bug means the picker never shows resolved data at
all, regardless of this fix. Verified instead by applying the exact
filter expression to real `classes.list` output for a real member/booking
(9 real "Sunrise Yoga" instances, `fromClassId: 700`): confirmed id `700`
is excluded from the result and the other 8 instances are not.

---

### RESCH-006 — Reschedule modal's class picker never actually renders data (infinite refetch loop)

**Severity:** High (the picker was effectively non-functional for every
user, always — not an edge case)
**Status:** Fixed on branch `reschedule-modal-member`, in a separate
commit from RESCH-005 per Rule 4. Originally discovered and documented
as unfixed while verifying RESCH-005 live in a headless Chromium session
(Playwright) — not something plan.md's audit or any prior pass caught —
then fixed immediately after at explicit request.
**Area:** Rescheduling / Frontend
**File:** `src/components/reschedule-modal.tsx` — the `classes.list`
`useQuery` call

**Original behavior:** `trpc.classes.list.useQuery({ from: new
Date().toISOString() }, { enabled: isOpen })` computed `from` inline on
every render. Because the input object was a new value every render,
tRPC/react-query treated each render as a *different* query — the fetch
that resolves triggers a state update, which causes a re-render, which
computes a new `from`, which starts a *new* query, forever. Reproduced
live: opening the modal fired **over 200 `classes.list` requests in 6
seconds**, climbing steadily with no sign of stopping, and the picker
showed "No other &lt;X&gt; classes available" for the entire 6-second
observation window even though the underlying data (confirmed via a
direct `classes.list` call) contained 9 matching classes. Confirmed via
`git stash` that this reproduced identically against the code exactly as
it existed before RESCH-005's fix — pre-existing, not introduced by that
change.

**Fix:** `from` is now computed via `useMemo(() => new
Date().toISOString(), [isOpen])` — stable across re-renders while the
modal stays open (only recomputed when `isOpen` itself changes), so the
query key stops changing and react-query stops treating every render as
a new query.

**Verification (live, Playwright/Chromium):** reopened the same
"Sunrise Yoga" reschedule modal used to discover the bug. Request count
polled every 300ms over 6 seconds stayed at exactly **1** (was 200+ and
climbing). The picker rendered all 8 other real "Sunrise Yoga" instances
(10, 11, 13, 14, 16, 17, 19, 20 Aug) and correctly excluded the original
(Sat 8 Aug, per RESCH-005) — screenshotted as visual proof. Zero browser
console errors. `tsc --noEmit` and `pnpm build` both clean.

---

### RESCH-007 — Reschedule modal's `error` state was never reset

**Severity:** Low (cosmetic/confusing, not a correctness or data-safety
bug — a stale error message displayed until overwritten, nothing was
mis-booked or mis-charged because of it)
**Status:** Fixed on branch `fix/resch-007-modal-error-reset`
**Area:** Rescheduling / Frontend
**File:** `src/components/reschedule-modal.tsx`

**Original behavior:** the modal's `error` state was only ever set (in
the mutation's `onError`), never cleared — see plan.md item #38. Because
the component is always mounted at its call site
(`dashboard/page.tsx:234`) and only toggles a `if (!isOpen) return null`
internally, its `useState` survives across opens/closes: reopening the
modal, picking a different target class, or dismissing it via the
overlay all left a previous failed attempt's error message visible on
screen until the next failed submit happened to overwrite it.

**Fix:** added one `handleClose()` that resets `selectedClassId` and
`error` before calling the `onClose` prop, and routed every way the
modal can go away through it — the overlay's `onClick`, the Cancel
button, and the mutation's `onSuccess` (which previously reset only
`selectedClassId`, not `error`). Also clears `error` the moment a
different target class is clicked, so a stale message doesn't linger
while browsing other options. This matches the shape plan.md's audit
suggested for this exact defect.

**Not in scope for this fix:** RESCH-005/RESCH-006 (picker
exclusion/infinite-refetch, both already fixed) and the underlying
reschedule eligibility rules in `reschedules.ts` are untouched — this is
purely local component state, no tRPC procedure input/output/error
shape changed.

**Verification:** `tsc --noEmit` shows no new errors (confirmed the only
pre-existing errors — `auth.ts`'s untyped `ctx.req` and
`corporate-bookings.ts`'s `creditsRemaining` — are unrelated and were
already present before this change). `next build` compiles this
component successfully; the build's later type-check stage fails only on
that same pre-existing, unrelated `auth.ts` issue. No headless-browser
tool (Playwright) was available in this session to reproduce the fix
live the way RESCH-005/006 were — verified instead by tracing every
`onClose`/`onClick` path in the diff by hand against the state-leak
mechanism described above.

---

### AUTH-001 through NOTIF-001 note

Both entries above were found while writing characterization tests, not
by inspection alone — the test-first workflow surfaced them naturally.
Expect more entries here as remaining routers get the same treatment;
none of the 57 items already inventoried in `plan.md` are being
re-logged individually here unless a characterization test also touches
them directly (to avoid two documents drifting out of sync — `plan.md` is
the audit, this file is the "confirmed by a passing test" subset).
