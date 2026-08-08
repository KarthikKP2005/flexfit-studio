# EDIT_LOG.md

Running record of every change made under AGENT_RULES.md, newest first.
Each entry: what changed, why, files touched, tests added/updated, defect
ID if applicable, and whether behavior changed.

AI tool usage note (Rule 9): all entries below were written with Claude
Code (Sonnet 5) in an interactive session — I reviewed and approved every
diff before it landed; nothing here was auto-applied.

---

## 2026-08-08 — FIX(plans): use a collision-resistant payment reference

**Type:** FIX
**Defect:** PLAN-003
**Behavior change:** yes — `subscribe`'s payment `reference` is now
`PAY-<uuid>` (`crypto.randomUUID()`) instead of `PAY-${Date.now()}`.
Output shape is unchanged (`reference` is still a string); only its
generated value changed. No DB-level unique constraint was added — see
known-issues.md's PLAN-003 entry for why (never queried by value
anywhere in this codebase, so it's not a business identifier plan.md's
own conditional would apply to).
**Files:** `src/server/routers/plans.ts` (`subscribe`'s reference
generation; new `import { randomUUID } from "node:crypto"`; file and
procedure header comments updated)
**Tests:** no automated test harness in this branch — verified manually
against the dev server: subscribed a member and confirmed
`payments.mine` shows a `PAY-<uuid>` reference
(`PAY-5c4e195e-8188-4e20-be34-fd478717907f`), not a timestamp. Also ran
`tsc --noEmit` and `next build` (both clean).

Closes known-issues.md's PLAN-003 (plan.md item #24). Landed on the same
branch as the PLAN-002 fix directly below (both touch `subscribe`, done
back to back), but as a separate commit per Rule 4 — one defect per
commit, even on a shared branch, same pattern as RESCH-005/RESCH-006.

---

## 2026-08-08 — FIX(plans): wrap subscribe's membership+payment insert in a transaction

**Type:** FIX
**Defect:** PLAN-002
**Behavior change:** yes — if the payment insert now fails, the
membership insert rolls back with it (previously the membership row
would remain committed with no matching payment). `subscribe`'s input
schema, output shape, and error codes are otherwise unchanged.
**Files:** `src/server/routers/plans.ts` (`subscribe`'s membership and
payment inserts moved inside `ctx.db.transaction(async (tx) => { ... })`,
using `tx` in place of `ctx.db` for both; the `existingActive` check
(PLAN-001) stays outside, unchanged; file and procedure header comments
updated)
**Tests:** no automated test harness in this branch — verified manually
against the dev server: subscribed a member with no active membership,
confirmed both the membership and payment rows were created together;
confirmed PLAN-001's duplicate-subscription rejection still fires
correctly afterward, unaffected by the transaction wrap. Did not attempt
to force a genuine mid-transaction failure (no tooling in this branch
for that) — the fix is the standard `db.transaction(...)` pattern, not
bespoke logic needing its own failure-injection proof. Also ran `tsc
--noEmit` and `next build` (both clean).

Closes known-issues.md's PLAN-002 (plan.md item #23).

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
