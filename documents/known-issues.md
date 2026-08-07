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

**Not in scope for this fix:** this does not expand CLASS-004's scope.
Waitlisted personal bookings and all corporate bookings on the cancelled
class are still left completely untouched (not cancelled, no credit
restored, and consequently — since they're never touched — no
notification either). Fixing that gap is CLASS-004's job, not this one.

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
assumes "one active membership per user" — see PLAN-005-style disagreement
risk below — becomes ambiguous)
**Status:** Confirmed from source (also flagged in plan.md, item #19)
**Area:** Membership
**File:** `src/server/routers/plans.ts` — `subscribe`

**Current behavior:** Inserts a new `status: "active"` membership row on
every call, with no check for an existing active membership for that
user. Calling `subscribe` twice for the same user creates two rows both
with `status: "active"`.

**Expected invariant:** undefined by the current code — plan.md lists
several plausible policies (reject/extend/queue/stack-with-explicit-charge)
and explicitly says the choice "should not be guessed during refactoring."

**Why not fixed here:** Needs an explicit product decision before a FIX
commit, not just a code change — see Rule 8 (never guess at an ambiguous
business rule).

**Reproduction:** `src/server/routers/plans.test.ts`'s
`plans.subscribe > PLAN-001: subscribing twice creates two simultaneous
active memberships...`

**What "fixed" would look like:** depends on the chosen policy — not
specified here.

---

### PLAN-002 — `subscribe`'s membership + payment inserts are not atomic

**Severity:** Low (SQLite/libsql writes rarely fail mid-request, but the
window exists)
**Status:** Confirmed from source (also flagged in plan.md, item #23)
**Area:** Membership / Payments
**File:** `src/server/routers/plans.ts` — `subscribe`

**Current behavior:** `db.insert(memberships)...` and
`db.insert(payments)...` are two separate statements, not wrapped in a
transaction. If the second insert throws, the membership row from the
first insert remains committed with no matching payment record.

**Expected invariant:** both inserts succeed or both roll back.

**Why not fixed here:** wrapping in a Drizzle transaction is a behavior
change to error handling (a failure now becomes "nothing happened" instead
of "orphaned membership") — needs its own FIX commit and a test that can
actually force the second insert to fail.

**Reproduction:** not independently reproduced by a test here (forcing a
mid-transaction failure requires more than characterization-level
tooling) — confirmed by reading the source; not disputed.

**What "fixed" would look like:** `await db.transaction(async (tx) => { ... })`
wrapping both inserts.

---

### PLAN-003 — Payment `reference` can collide across concurrent subscriptions

**Severity:** Low (references are informational, not enforced unique by
the schema — see plan.md's DB-integrity findings)
**Status:** Confirmed from source (also flagged in plan.md, item #24)
**Area:** Payments
**File:** `src/server/routers/plans.ts` — `subscribe`

**Current behavior:** `reference: \`PAY-${Date.now()}\`` — two `subscribe`
calls resolving within the same millisecond produce byte-identical
reference strings. `payments.reference` has no unique constraint, so this
doesn't error, it just produces duplicate references.

**Expected invariant:** each payment gets a distinguishable reference.

**Why not fixed here:** changing the reference format changes payment
data shape going forward — a FIX, not a refactor.

**Reproduction:** `src/server/routers/plans.test.ts`'s
`plans.subscribe > PLAN-003: two subscriptions in the same millisecond
produce the same payment reference` (mocks `Date.now()` to force the
collision deterministically).

**What "fixed" would look like:** a UUID or crypto-random suffix instead
of (or in addition to) the timestamp.

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

**Severity:** Medium (member keeps classes they were refunded for, and
keeps whatever credits they still had)
**Status:** Confirmed from source (also flagged in plan.md, item #22)
**Area:** Payments / Membership
**File:** `src/server/routers/payments.ts` — `refund`

**Current behavior:** `refund` sets the payment to `status: "refunded"`
and, if the payment has a `membershipId`, sets that membership's `status`
to `"cancelled"`. Nothing else changes: existing `bookings` rows made
against that membership stay `"booked"` (the member can still attend),
and `creditsRemaining` is untouched.

**Expected invariant:** undefined by the current code — plan.md lists
several plausible policies (cancel future bookings / keep them valid /
restore or remove credits / remove waitlist entries) and says explicitly
this "should not be guessed during refactoring."

**Why not fixed here:** needs a product decision on what a refund should
mean for already-committed bookings before this is a FIX, not a guess.

**Reproduction:** `src/server/routers/payments.test.ts`'s
`payments.refund > PAY-001: does not touch bookings or credits already
made against the cancelled membership`.

**What "fixed" would look like:** depends on the chosen policy — not
specified here.

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

**Severity:** Medium (member-facing dashboard can show a cancelled/expired
membership as current, while `bookings.ts`'s `activeMembershipFor` uses a
different, status-aware query — the two can disagree)
**Status:** Confirmed from source (also flagged in plan.md, item #20)
**Area:** Membership
**File:** `src/server/routers/members.ts` — `profile`

**Current behavior:** `orderBy(desc(memberships.endDate))` with no status
filter, first row wins. A `cancelled` membership with a later `endDate`
than the user's actually-`active` one is what gets shown as "current."

**Expected invariant:** one single definition of "current membership,"
used consistently by `profile`, `bookings.ts`'s booking eligibility, and
anywhere else membership status matters.

**Why not fixed here:** plan.md recommends a shared
`getCurrentMembership(userId, atDate)` resolver — a genuine
cross-cutting change, not a local one-line fix, and out of scope for a
comment/structure pass.

**Reproduction:** `src/server/routers/members.test.ts`'s
`members.profile > MEMBER-002: shows the membership with the latest
endDate even if a different one is the actually-active one`.

**What "fixed" would look like:** a shared membership-resolution helper
used by both `profile` and `bookings.ts`, per plan.md's recommendation.

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
**Status:** Confirmed from source (also flagged in plan.md, item #10)
**Area:** Classes / Security
**File:** `src/server/routers/classes.ts` — `byId`

**Current behavior:** `byId` is `publicProcedure`, and its response
includes `roster: [{bookingId, status, memberName, memberEmail}]` for
every booking on that class — no sign-in required.

**Reproduction:** `src/server/routers/classes.test.ts`'s
`classes.byId > CLASS-001: an anonymous (unauthenticated) caller
receives the full roster...`

**Why not fixed here / what "fixed" would look like:** per plan.md — split
into `classes.publicById` (class details only, still public) and keep
`rosterFor` (already exists, `staffProcedure`) as the only source of
attendee info. Changes `byId`'s output shape, so it's a FIX with its own
defect-specific test, treated as a security correction rather than a
cosmetic refactor.

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
class is never told, and a corporate attendee's booking silently survives
a class that no longer exists)
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 9)
**Area:** Classes / Corporate bookings / Notifications
**File:** `src/server/routers/classes.ts` — `cancel`

**Current behavior:** sets `classes.cancelled = true`, then only updates
`bookings` rows with `status = "booked"` to `"cancelled"`. Does not: touch
`waitlisted` bookings, touch `corporateBookings` at all (any status),
restore any membership credit, restore any company credit pool, or
insert a `class_cancelled` notification (the type exists in the schema
and is unused here, same gap as NOTIF-001's sibling types).

**Reproduction:** `src/server/routers/classes.test.ts`'s
`classes.cancel` tests — one shows the waitlisted-entry gap directly, the
other shows credits/corporate bookings are untouched.

**Why not fixed here / what "fixed" would look like:** per plan.md — a
`cancelClass` service that atomically cancels all active normal and
corporate bookings, restores credits appropriately, and notifies affected
members. Large enough, and touches enough shared behavior (see BOOK/CORP
entries once bookings.ts and corporate-bookings.ts are characterized),
that it needs its own careful FIX with characterization tests proving the
*current* incomplete behavior first — noted here as a marker for that
future test suite.

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
lookup, characterized once that file gets its own tests)
**Status:** Confirmed from source (also flagged in plan.md, item #12)
**Area:** Corporate accounts
**File:** `src/server/routers/admin-companies.ts` — `linkMember`

**Current behavior:** `linkMember` only rejects an exact duplicate
(same `userId` + `companyId` pair, via CONFLICT) — nothing stops a second
`linkMember` call linking the same user to a *different* company. The
schema has no unique constraint on `companyMembers.userId` either.

**Reproduction:** `src/server/routers/admin-companies.test.ts`'s
`adminCompanies.linkMember / unlinkMember > COMPANY-001: allows linking
the same member to a second, different company`.

**Why not fixed here / what "fixed" would look like:** per plan.md — the
simpler, safer rule is one active company per member, enforced with a
unique constraint on `companyMembers.userId`. That's a schema change
(Rule 1.2: needs a migration and a recorded reason), so it's a FIX with
its own commit, not part of this pass.

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
- RESCH-003 (reschedule frees a seat but never triggers *any* promotion)
  and CLASS-004 (class cancellation doesn't either) — `promoteNextWaitlisted`
  is now available for both as natural follow-up work, but wasn't wired
  in here; only the two `cancel` mutations that already had promotion
  logic were touched.

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
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 5)
**Area:** Rescheduling
**File:** `src/server/routers/reschedules.ts` — `reschedule`

**Current behavior:** the new booking's `creditsUsed` is copied directly
from the original (`creditsUsed: originalBooking.creditsUsed`). A
waitlisted original has `creditsUsed: 0`; if the target class isn't full,
the new booking is created with `status: "booked"` and `creditsUsed: 0`
— a confirmed seat the member never paid for.

**Reproduction:** `src/server/routers/reschedules.test.ts`'s
`reschedules.reschedule > RESCH-001: rescheduling a waitlisted (0-credit)
booking to an available class produces a confirmed booking that was
never actually charged`.

**Why not fixed here / what "fixed" would look like:** per plan.md —
reschedule needs an explicit credit policy per transition (confirmed→
confirmed, confirmed→waitlisted, waitlisted→confirmed, waitlisted→
waitlisted); waitlisted→confirmed should charge the class's cost, not
copy a zero.

---

### RESCH-002 — Rescheduling into a full class, then being promoted later, can charge credits twice for one booking

**Severity:** High
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 6)
**Area:** Rescheduling / Waitlist
**File:** `src/server/routers/reschedules.ts` — `reschedule` (interacts
with `bookings.ts`'s `cancel` promotion logic)

**Current behavior:** rescheduling a paid (`creditsUsed > 0`) booking
into a full target class creates a waitlisted booking that keeps the
original's nonzero `creditsUsed`. When that booking is later promoted
(via `bookings.ts`'s `cancel`, see BOOK-004's promotion block),
`creditsUsed` is overwritten to the target class's cost and the
membership is charged again — a second charge for what was originally one
booking.

**Reproduction:** `src/server/routers/reschedules.test.ts`'s
`reschedules.reschedule > RESCH-002: rescheduling a paid booking into a
full class, then having it promoted later, charges credits a second time
for one logical booking` — books a class for real (first charge), then
reschedules into a full class and triggers a promotion (second charge),
and shows the membership loses two credits for one continuous booking.

**Why not fixed here / what "fixed" would look like:** per plan.md — a
waitlisted booking should consistently represent *unspent* credits
(`creditsUsed: 0`) across booking, rescheduling, cancellation, and
promotion; if credits are meant to be reserved while waitlisted instead,
that rule needs to be applied consistently everywhere, not just here.

---

### RESCH-003 — Rescheduling away from a class never promotes that class's waitlist

**Severity:** Medium
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 7)
**Area:** Rescheduling / Waitlist
**File:** `src/server/routers/reschedules.ts` — `reschedule`

**Current behavior:** the original booking is cancelled as part of a
reschedule, freeing its seat — but unlike `bookings.ts`'s `cancel`,
`reschedule` never runs any waitlist-promotion logic for the class being
left. Anyone waitlisted for the original class stays waitlisted.

**Reproduction:** `src/server/routers/reschedules.test.ts`'s
`reschedules.reschedule > RESCH-003: does not promote anyone waiting for
the seat freed on the original class`.

**Why not fixed here / what "fixed" would look like:** per plan.md — call
the same waitlist-promotion logic `bookings.ts`'s `cancel` uses, after
successfully cancelling the original booking.

---

### RESCH-004 — Reschedule copies the original credit cost, ignoring the target class's actual cost

**Severity:** Medium
**Status:** Confirmed from source (also flagged in plan.md's critical
list, item 8)
**Area:** Rescheduling
**File:** `src/server/routers/reschedules.ts` — `reschedule`

**Current behavior:** same-named classes are not required to share a
`creditCost` (see the header comment on `classes` in `schema.ts`), but
`reschedule` copies the *original* booking's `creditsUsed` onto the new
booking regardless of what the target class actually costs.

**Reproduction:** `src/server/routers/reschedules.test.ts`'s
`reschedules.reschedule > RESCH-004: preserves the original creditsUsed
even when the target class has a different creditCost`.

**Why not fixed here / what "fixed" would look like:** per plan.md —
define one policy: require equal cost between source and target
(simplest, behavior-preserving to validate and document mismatches as a
known issue), charge/refund the difference, or scope reschedules to a
class-series entity that guarantees equal cost.

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

### AUTH-001 through NOTIF-001 note

Both entries above were found while writing characterization tests, not
by inspection alone — the test-first workflow surfaced them naturally.
Expect more entries here as remaining routers get the same treatment;
none of the 57 items already inventoried in `plan.md` are being
re-logged individually here unless a characterization test also touches
them directly (to avoid two documents drifting out of sync — `plan.md` is
the audit, this file is the "confirmed by a passing test" subset).
