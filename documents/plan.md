this is the hacthon im gng to participate in

Title

	

2026 i12 HR Drive Hackathon: Computer Science Project Type

	




	




	







Summary

Duration: 1–15 August 2026

Individual submission

Two projects, both released now

Overview

Callus is hiring engineers and this is how we're finding them. Two projects, fourteen days, work at whatever pace suits you. We're looking at four things: how clearly you communicate, how you organise documentation, how you write code, and how you handle a problem you haven't seen before.

On AI, since you're going to wonder: use it. We use it every day and we have no interest in whether you can code without it. What we want to see is how carefully you use it, and whether you actually understand what ends up in your repo. Those two things look the same for about five minutes and completely different over fourteen days. At the end we'll ask what tools you used. Answer honestly. There's no wrong answer and it isn't scored.

	

	

	

	







	




	




	




	







Project

	

Deliverable

	

Scope

	

What earns credit

	







Project 1

	

FlexFit Studio refactor

	

Restructure a working gym management app (members, bookings, credits, waitlists, front desk, revenue reports) into a codebase someone would actually want to work in.

	

Behavior preserved exactly; a structure you can defend.

	







Project 2

	

AI detector for admissions essays

	

A detector for college admissions essays, with a real interface: paste an essay in and see which parts were probably written by a machine, and why.

	

Shows where and why, with honest accuracy reporting, not a single percentage.

	







Evaluation

	

Four criteria

	

Clear communication, organised documentation, code quality, handling unfamiliar problems.

	

AI tool use expected; usage disclosed at the end, not scored.

	







	

	

	

	




The Projects

Project details below. Clone the repo rather than forking it, and push your work to your own private repository.

A. Project 1: FlexFit Studio

A gym management app where everything works. It has been through five developers in two years, none of whom spoke to each other and all of whom were behind schedule.

Details:

Members book classes, buy memberships, spend class credits and sit on waitlists.

Staff run a front desk, manage trainers and pull revenue reports; companies buy credit pools for their employees to use.

Stack: Next.js 15 (App Router), TypeScript, tRPC, Drizzle ORM, SQLite, Tailwind. Around 5,400 lines across 40 files.

Repo: https://github.com/Rahul-Callus/flexfit-studio (setup in the README; the documents/ folder is empty, for your own notes)

Notes:

Restructure and rewrite to sensible modern Next.js and TypeScript practice: break up files that have grown too big, and pull repeated logic into one place instead of four. If a file is doing two unrelated jobs, it probably shouldn't be.

There is no one correct folder layout. We mark whether the structure makes sense and whether you can explain why you picked it.

B. Project 1: What must not change

The app has to behave exactly the same when you're done.

Details:

Every feature that works today still works: same inputs, same outputs, same errors, same edge cases. A member who could book a class can still book it; an admin who could refund a payment can still refund it.

Nobody hands you a list of what the app currently does. Working that out, then protecting it while you change everything around it, is the exercise. How you go about that is up to you.

Staying in the TypeScript and leaving the database alone is fine.

Going further and changing the data model is also fine if you think the design needs it. We're not after a particular depth, we're after a decision you can defend.

Notes:

If you find something that looks wrong, you have two good options: fix it carefully, or write it up clearly and leave it alone. Either earns credit. Missing it doesn't.

Some references, if useful, are linked under Links & Logistics below.

C. Project 2: AI detector for admissions essays

An AI detector for college admissions essays: a working application with a real interface, not a script and not a notebook.

Details:

Paste an essay in; the app shows which parts were probably written by a machine, and why it thinks so.

Use whatever language and stack you like. We care about what it does, not what it's written in.

'73% AI' gives a reader nothing they can act on and nothing they can argue with. Show them where, and show them why.

Not a wrapper: a detector that sends the essay to a chat model and asks for a verdict is unreliable, cannot explain its reasoning, and takes an afternoon to build. We will be able to tell.

Notes:

Using a language model as an instrument is fine. Running text through a small local model for token probabilities, then doing your own analysis on those numbers, is real work and it's how good detectors are actually built.

One line is worth drawing carefully: the model must not make the judgement call while your app relays the verdict.

D. Project 2: Approach, data and honesty

Machine prose differs from human prose in ways you can measure.

Details:

Machine prose is measurably different from human prose: it is smoother than it should be, its sentence rhythms are more even, and it repeats a narrower set of constructions than people do.

Some of those differences are statistical; others only appear when a passage is compared against a body of other writing. Selecting which signals to use, and how to combine them, is the core of the project.

The realistic case is a paragraph a person wrote and a model later polished. Detection therefore has to work at the level of sentences and passages, and every flag should be backed by visible evidence.

Building the dataset is part of the work: source the human essays, generate the machine ones, and document where the data came from, how much there is, and what it does not cover. A detector trained only on essays about sports will perform unpredictably on other subjects.

Notes:

Report honest accuracy: results on your own test set, three essays the detector gets confidently wrong, and your explanation of why. That demonstrates you understand your own system; a bare accuracy claim does not.

These detectors have a habit of flagging writers who learned English as a second language. If yours does, we'd like to know you spotted it.

	




	




	




	










	




	




	




	







Item

	

Detail

	




	




	







Event window

	

1–15 August 2026

	




	




	







Format

	

Individual submission; both projects released now.

	




	




	







Project 1 repo

	

github.com/Rahul-Callus/flexfit-studio (clone, don't fork)

	




	




	







Project 1 stack

	

Next.js 15, TypeScript, tRPC, Drizzle, SQLite, Tailwind (~5,400 lines / 40 files)

	




	




	







Project 2 stack

	

Your choice, judged on behavior rather than language.

	




	




	







Submission

	

Push to your own private repository.

	




	




	







Evaluation

	

Communication, documentation, code quality, unfamiliar problems.

	




	




	







How it's judged:

Both projects reward the same thing: decisions you can defend. Project 1 is about protecting behavior you had to discover for yourself while restructuring everything around it. Project 2 is about building an instrument that shows its evidence instead of borrowing a verdict from a chat model.

AI tooling is expected, not policed. Use it carefully and understand everything that ends up in your repo. Detection is genuinely hard and every honest detector has failure modes; ours would too. A report that says 'here is my accuracy, here are three essays it gets confidently wrong, and here is my theory about why' is worth far more than a 97% claim we don't believe.

Links & Logistics

Repo, references, and submission details:

Project 1 repo: clone it rather than forking it. Setup instructions are in the README, and the repo's documents/ folder is for your own notes.

https://github.com/Rahul-Callus/flexfit-studio

References: Next.js project structure, Google TypeScript style guide, tRPC router organisation.

https://nextjs.org/docs/app/getting-started/project-structure

https://google.github.io/styleguide/tsguide.html

https://trpc.io/docs/server/routers

Submission Formats

Project 1: Public Github Repo Link, Video Recording (Optional)

Project 2: Public Github Repo Link, Video Recording (Optional)

Submission

Please submit the deliverable to the Submission Form Link.

Timeline

Submission open today. Submissions close Saturday 15 August, 23:59 IST. Results announced after the event.

	




	




	




	






im doing project 1 now

look at everythung below

pnpm db:push
pnpm db:seed
pnpm dev


Now let's dig into all the routers to understand exact functionality.Now let's look at the app pages to see what's actually wired to UI vs. just backend.Now the companies pages and reschedule-modal component.Now let's check the reschedule modal, seed data (for context), and password/format lib.I have enough detail now. Let me put together the comprehensive breakdown.I now have a complete picture of the codebase. Here's the full breakdown.Good — I have everything I need. Here's the full picture, based directly on the code.

## What FlexFit Studio is

A **class-booking + membership app for a single gym**, built with Next.js 15 (App Router), tRPC, Drizzle ORM, and SQLite. Cookie-session auth (no OAuth/JWT — a random token in a `sessions` table). Three roles: `member`, `trainer`, `admin`.

## Data model (11 tables)
`users`, `sessions`, `membershipPlans`, `memberships`, `classes`, `bookings`, `checkins`, `payments`, `notifications`, `trainerAvailability`, plus a corporate layer: `companies`, `companyMembers`, `corporateBookings`, and `reschedules`.

---

## Member flow
1. **Sign in** at `/login` (demo creds shown on the page). There's a `register` mutation in `auth.ts` but **no signup page exists** — new members can only be created by an admin or via seed data.

2. **Browse `/schedule`** — public list of upcoming classes (name, time, room, trainer, spots left, credit cost). Booking button requires sign-in.
3. **Book a class** → `bookings.book`:
   - Blocked if class is cancelled/already started, if you're already booked/waitlisted, if you have no active membership, or insufficient credits.
   - If the class is full, you're **waitlisted** instead of booked (no credits deducted until promoted).
   - Unlimited plans (`creditsRemaining >= 999`) never decrement.
4. **`/plans`** — view membership plans, `subscribe` (creates a membership + an auto-`paid` payment record — no real payment gateway, just instant "paid").
5. **`/dashboard`** — "My bookings" (upcoming only), membership card, cancel/reschedule buttons, reschedule history.
   - **Cancel** (`bookings.cancel`): free refund of the credit if ≥12h before class start; cancelling later forfeits the credit. Cancelling a confirmed spot auto-promotes the longest-waiting waitlisted person.
   - **Reschedule** (`reschedules.reschedule`): only within a stricter window (≥4h before start), and only to **another class instance with the exact same name** (e.g. another "Sunrise Yoga" slot). Keeps the same credits.
6. **`/waitlist`** — shows your queue position per class, lets you leave the waitlist.
7. **`/notifications`** — bell icon with unread badge, mark-all-read. **Only ever populated by admin broadcasts** — the schema defines `waitlist_promotion`, `class_cancelled`, `membership_expiring` notification types but nothing in the code ever creates them. Getting promoted off a waitlist, a class being cancelled, or your membership nearing expiry produces **no notification** today.
8. **Corporate booking is backend-only.** Companies/employee credit pools exist (`corporateBookings` router: book/cancel/markAttended/roster, with its own 24h free-cancellation window), but **no member-facing page ever calls it** — `/schedule` only ever calls the personal `bookings.book`. A member linked to a company has no way in the UI to spend their employer's credit pool.

## Trainer flow
1. Sign in → role-gated `/trainer/schedule`.
2. **Upcoming classes** assigned to them, with a live booked-count and checked-in-count per class (fetches full roster but only displays counts, not names).
3. **Weekly availability** — set/edit/remove a start–end time per day of week (`trainerAvailability` table).
4. Trainers can also access `/kiosk` (shared with admin) to check members in.
5. Gaps: trainers have **no way to cancel their own class, edit class details, or see the roster by name** in this UI (only admins/staff endpoints allow it, but there's no UI wired for a trainer to use `classes.update`/`classes.cancel`). There's also a `trainers.checkAvailability` procedure that cross-checks a proposed class time against a trainer's availability and existing classes — it exists in the router but **nothing in the UI ever calls it**, so class creation never actually validates trainer availability/conflicts even though the plumbing is built.

## Admin flow
1. **`/admin`** — dashboard: member count, active memberships, upcoming classes, total revenue, check-ins, pending payments; class utilisation list; recent payments. Links out to Companies / Reports / Announcements (these three pages are **not in the NavBar**, only reachable from this dashboard or direct URL).
2. **`/admin/attendance`** — check-ins per day (14d), top trainers by attended count, no-show list.
   - Caveat: **no code path ever sets a booking to `no_show`** — that status only appears in seed data, so in a live system this list would stay empty forever (there's no cron/admin action that flags a `booked` class as a no-show after it ends).
3. **`/admin/reports`** — revenue by month/by payment method, refund count, memberships expiring in 14 days.
4. **`/admin/announcements`** — broadcast a title+message to every member as a notification.
5. **`/admin/companies`** and **`/admin/companies/[id]`** — full corporate CRUD: create company, top up credit pool, activate/deactivate, search-and-link/unlink members, view recent corporate bookings.
6. **`/kiosk`** (admin+trainer) — look up a member by email/phone, see their upcoming classes (next 2h), check them in. UI-only guards flag expired membership / zero credits and disable the button, but this is cosmetic — it doesn't call the server to re-verify before check-in.
7. Backend-only admin capabilities with **no UI at all**: `members.search`/`byId`/`setActive`/`setRole` (no member-management page — you can't view a directory of members, deactivate one, or promote someone to trainer/admin from the UI), `classes.create`/`update`/`cancel` (no class-scheduling UI), `plans.create`/`setActive` (no plan-management UI), `payments.markPaid`/`refund` (no way to refund/mark-paid from the UI, only see the list).

---

### Summary of the real gaps (useful to know for the hackathon task)
- No registration UI (backend exists).
- Corporate booking pool is fully built server-side but completely disconnected from any member-facing page.
- Three notification types are defined but never triggered (no waitlist-promotion, class-cancellation, or expiry notices).
- `no_show` is a dead status outside of seed data — nothing marks it live.
- Admin has several mutations (member management, class CRUD, plan CRUD, payment refund/mark-paid) with zero UI.
- Trainer availability-checking exists but is never invoked from class creation, so double-booking a trainer is currently possible.
- Kiosk's membership/credit warnings are cosmetic, not server-enforced at check-in time.

If you want, I can also sketch this as a diagram (role × flow) or turn it into a written project-status doc you could drop in `documents/` for the hackathon submission.


Project 1 :Flex-Fit Studio


documents/
├── behavior-inventory.md
├── system-map.md
├── architecture-plan.md
├── known-issues.md
└── baseline-results.md
 
For every feature, record: 
User role
Starting data
Action
Input
Output
Error code and message
Database side effects
UI change
Edge cases
 
Behaviour matrix to investigate 


Domain
Scenarios to capture
Authentication
Correct login, wrong password, inactive user, logout, unauthenticated route
Permissions
Member accessing staff action, trainer accessing admin action, admin access
Membership
Purchase, activation, expiration, frozen or cancelled membership, credit balance
Booking
Successful booking, duplicate booking, no membership, insufficient credits
Capacity
Last available place, full class, waitlisting
Cancellation
Before and after the 12-hour membership limit
Corporate booking
Employee booking, company pool deduction, insufficient pool, 24-hour cancellation
Waitlist
Join, cancel, promotion, credit deduction during promotion
Rescheduling
Valid reschedule, full target class, invalid source booking, credit movement
Front desk
Member lookup, check-in, repeat check-in, invalid booking
Payments
Paid, pending, failed, refund, repeated refund
Classes
Creation, cancellation, trainer assignment, capacity
Reports
Revenue totals, payment methods, attendance, trainer results
Notifications
Waitlist promotion, announcements, read state


tRPC is a TypeScript-based library that enables type-safe, end-to-end communication between frontend and backend without requiring schemas or code generation.

Create a System map : 

Page
  ↓
tRPC procedure
  ↓
validation and permissions
  ↓
business rules
  ↓
database tables
  ↓
notifications or other side effects


Add characterization tests
These are not “ideal design” tests. They capture what the system does today, including unusual behaviour.
The best level for most backend tests is the tRPC caller level. tRPC officially supports server-side callers, which are especially useful for integration testing procedures without going through HTTP.

Day 1 deliverables
By the end of Day 1, we must have:
Application running
Baseline command results recorded
Complete route and procedure map
Feature behaviour inventory
High-risk business flows identified
Initial characterization tests
Proposed folder structure
List of issues to fix or document
No major refactoring should happen before this point.





List
1. Critical confirmed functional problems
2. Class capacity can be exceeded
Files
src/server/routers/bookings.ts
src/server/routers/corporate-bookings.ts
src/server/routers/classes.ts

Normal booking capacity is calculated only from the bookings table. Corporate booking capacity is calculated only from the corporateBookings table.
For a class with capacity 20, the system could potentially accept:
20 normal bookings
20 corporate bookings
That produces 40 confirmed participants for a 20-person class.
The public schedule also calculates spotsLeft using only normal bookings, so the displayed availability can be incorrect. (GitHub)
Required change
Create one shared capacity service that counts confirmed attendees from both booking sources:
confirmed normal bookings
+ confirmed corporate bookings
= total occupied capacity

This same calculation must be used by:
Normal booking
Corporate booking
Rescheduling
Schedule display
Trainer roster
Admin utilisation reports

2. Normal and corporate waitlists do not coordinate
Files
src/server/routers/bookings.ts
src/server/routers/corporate-bookings.ts

When a normal member cancels, the system only looks at the normal waitlist. When a corporate member cancels, it only looks at the corporate waitlist.
That means a class seat can become available while someone in the other waitlist remains waiting. It also means there is no single fair chronological queue. (GitHub)
Required change
Create a unified waitlist promotion service that:
Reads the oldest waiting candidate from both booking tables.
Compares their bookedAt timestamps.
Verifies that the candidate still has eligible credits.
Promotes only one valid candidate.
Deducts credits atomically.
Sends a promotion notification.
Alternatively, consolidate both booking types into one bookings table with a credit-source field, but that is a much larger database change.

3. Corporate waitlist promotion can create a free booking
File
src/server/routers/corporate-bookings.ts

The code first changes a corporate booking from waitlisted to booked. Only afterwards does it check whether the company has sufficient credits.
When the company no longer has enough credits, the balance is not deducted, but the booking remains confirmed. (GitHub)
Required change
The order must be:
Load company
→ verify credits
→ deduct credits
→ promote booking

All operations must be wrapped in one database transaction.
When credits are insufficient, the system should either:
Skip that waitlisted booking and check the next candidate, or
Leave the candidate waitlisted and record why promotion failed.
The chosen behaviour must be documented because the current expected behaviour is not defined.

4. Normal waitlist promotion can overdraw a membership
File
src/server/routers/bookings.ts

Normal promotion does not verify that the member still has sufficient credits. It promotes the member and then calculates:
Math.max(0, creditsRemaining - creditCost)

A member with zero credits can therefore be promoted into a paid class while their balance simply remains zero. (GitHub)
Required change
Validate available credits before promotion. Never use Math.max(0, ...) as a replacement for eligibility validation.

5. Rescheduling from a waitlist can create a free confirmed booking
File
src/server/routers/reschedules.ts

Waitlisted bookings have creditsUsed = 0. During rescheduling, the new booking copies the original creditsUsed.
Therefore:
Waitlisted original booking: 0 credits
→ reschedule to available class
→ new confirmed booking: 0 credits

The user receives a confirmed class without spending the class cost. (GitHub)
Required change
Rescheduling must distinguish between:
Confirmed → confirmed
Confirmed → waitlisted
Waitlisted → confirmed
Waitlisted → waitlisted
Each transition needs an explicit credit policy.

6. Rescheduling to a full class can lead to double charging
File
src/server/routers/reschedules.ts

When a confirmed booking is rescheduled to a full class, the new waitlisted booking keeps the original non-zero creditsUsed.
Later, normal waitlist promotion deducts the class cost again. That can cause the member to pay twice. (GitHub)
Required change
A waitlisted booking should consistently represent unspent credits:
status: "waitlisted"
creditsUsed: 0

If the project intentionally reserves credits while waitlisted, that rule must be implemented consistently across original booking, rescheduling, cancellation and promotion.

7. Rescheduling does not promote the old class’s waitlist
File
src/server/routers/reschedules.ts

Rescheduling cancels the original booking and creates a new one, but it does not promote anyone waiting for the newly freed seat in the original class. (GitHub)
Required change
After successfully cancelling the original confirmed booking, call the same unified waitlist promotion service used by normal cancellation, corporate cancellation and class administration.

8. Rescheduling preserves the wrong credit cost
File
src/server/routers/reschedules.ts

Rescheduling is based on classes having the same name, but classes with the same name can still have different creditCost values. The code copies the original booking’s credits instead of calculating the target class cost. (GitHub)
Required change
Define and document one policy:
Require source and target classes to have equal credit costs, or
Charge/refund the difference, or
Allow rescheduling only within a class-series entity that guarantees equal cost.
The safest behaviour-preserving option is initially to validate equal credit cost and document mismatches as a known issue.

9. Class cancellation does not correctly clean up bookings
File
src/server/routers/classes.ts

Cancelling a class currently:
Marks the class cancelled.
Cancels only normal bookings with status booked.
Does not cancel normal waitlisted bookings.
Does not cancel corporate bookings.
Does not restore membership credits.
Does not restore company credits.
Does not notify affected members. (GitHub)
The notification schema already includes a class_cancelled type, but this cancellation flow does not use it. (GitHub)
Required change
Create a cancelClass service that atomically:
Marks the class cancelled.
Cancels all active normal bookings.
Cancels all active corporate bookings.
Restores credits where applicable.
Marks waitlisted entries cancelled without credit refunds.
Creates member notifications.
Returns a structured cancellation summary.
This change needs careful characterization tests because the existing incomplete behaviour may technically be considered the current contract.

10. Class roster exposes member names and emails publicly
File
src/server/routers/classes.ts

classes.byId uses publicProcedure but returns a roster containing member names and email addresses. Anyone who can call the endpoint can request a class ID and receive member information. (GitHub)
Required change
Separate the procedure into:
classes.publicById
→ class details only

classes.rosterFor
→ staffProcedure
→ member and booking details

This should be treated as a security correction rather than a cosmetic refactor.

11. Deactivated users retain existing sessions
Files
src/server/trpc.ts
src/server/routers/members.ts

Login prevents inactive users from signing in. However, request context creation accepts an existing non-expired session without checking user.active.
When an admin deactivates a user, existing sessions are not deleted and the context still authenticates that user. (GitHub)
Required change
Do both:
if (!row.user.active) {
  user = null;
}

And when deactivating an account:
Update user active=false
→ delete all sessions belonging to that user

These operations should happen inside one transaction.

12. A member can belong to multiple companies ambiguously
Files
src/db/schema.ts
src/server/routers/admin-companies.ts
src/server/routers/corporate-bookings.ts

The schema does not prevent one user from being linked to several companies. The linking endpoint only prevents the same user-company pair from being duplicated.
Corporate booking then retrieves one active company using a single-row .get() operation. If the member belongs to multiple active companies, which company pays may depend on database row selection. (GitHub)
Required change
Choose one model:
One active company per member: add a unique constraint on companyMembers.userId.
Multiple companies: require companyId in the corporate booking input and show company selection in the UI.
For this project, one active company per member is the simpler and safer rule.

2. Major functional gaps
3. Corporate booking backend appears to have no member-facing UI
The repository contains a complete corporateBookings tRPC router, but the schedule page uses the normal booking procedure. No corporate member booking route is visible in the App Router structure. (GitHub)
Required change
The schedule must identify whether the member can use:
Personal membership credits
Corporate credits
Either source
When both are available, provide an explicit credit-source selector. Do not silently select one.
Because adding a new selector changes user behaviour, first document the current absence and protect the existing normal-booking flow with tests.

14. Corporate members cannot use the existing kiosk flow
Files
src/app/kiosk/page.tsx
src/server/routers/bookings.ts
src/server/routers/corporate-bookings.ts

The kiosk loads bookings.upcomingForMember and performs bookings.markAttended, both of which operate on normal bookings. Corporate bookings have separate attendance logic and are not included in this kiosk flow. (GitHub)
Required change
Create a unified check-in lookup that returns a booking source:
{
  bookingId: number;
  bookingSource: "membership" | "corporate";
  classId: number;
  ...
}

Then call a shared attendance service rather than separate UI-specific mutations.

15. Corporate attendance cannot be fully reported
Files
src/db/schema.ts
src/server/routers/corporate-bookings.ts
src/server/routers/admin.ts

The checkins.bookingId foreign key points only to normal bookings. A corporate check-in therefore cannot be associated with its corporate booking through that field.
Admin and trainer reporting rely primarily on normal bookings and check-ins, so corporate attendance can be missing or untraceable. (GitHub)
Required change
Possible schema design:
checkins
- id
- userId
- classId
- bookingSource
- membershipBookingId nullable
- corporateBookingId nullable
- checkedInAt
- source

A smaller alternative is adding classId and corporateBookingId, but database changes must include a migration and regression tests.

16. Trainer roster and utilisation reports ignore corporate bookings
Files
src/app/trainer/schedule/page.tsx
src/server/routers/admin.ts
src/server/routers/classes.ts

Trainer cards call the normal booking roster and count. Public schedule availability and admin class utilisation also count only the normal booking table. Corporate participants will therefore be absent from some totals. (GitHub)
Required change
Introduce one shared classOccupancy query/service returning:
{
  membershipBooked: number;
  corporateBooked: number;
  attended: number;
  waitlisted: number;
  totalConfirmed: number;
  spotsLeft: number;
}


17. Payment refund functionality exists in the backend but is not exposed in the admin UI
The payments router supports markPaid and refund. The admin dashboard only displays recent payments, while the reviewed admin routes do not include a dedicated payment-management page. (GitHub)
Required change
Either:
Add an admin payments page with the existing mutations, or
Clearly document that refund support exists only at API level.
Because the assignment explicitly mentions an admin refunding a payment, this workflow should be included in the manual behaviour inventory even if the existing frontend does not expose it.

18. Class and trainer management APIs are not fully represented in the admin interface
The backend supports class creation, updates, cancellation and trainer availability checks. The reviewed admin route structure mainly includes dashboard, companies, reports, attendance and announcements. (GitHub)
Required change
Do not immediately add new management screens during a behaviour-preserving refactor. First document:
Backend capability exists
Frontend workflow not discovered

Then confirm whether API-only capability counts as current functionality.

3. Membership and payment correctness risks
4. Users can create multiple simultaneous active memberships
File
src/server/routers/plans.ts

Subscribing inserts a new active membership without checking for another active membership. Repeated subscription calls can therefore create overlapping memberships and separate paid payment records. (GitHub)
Required change
Before modifying this, test and document the intended renewal behaviour.
Possible policies:
Reject subscription while an active membership exists.
Extend the current membership.
Queue the new membership to start after the current one.
Permit stacking and explicitly select which membership is charged.
The current implicit behaviour is dangerous because different queries can select different membership records.

20. Dashboard membership and booking membership can disagree
Files
src/server/routers/members.ts
src/server/routers/bookings.ts

The member profile returns the membership with the latest endDate, regardless of status. Booking logic separately searches for an active membership.
The dashboard may therefore display one membership while booking uses another, or display an expired/cancelled membership as the current one. (GitHub)
Required change
Create one central membership resolver:
getCurrentMembership(userId, atDate)

Use it consistently in:
Profile
Dashboard
Booking
Kiosk
Plan subscription
Admin member details

21. Membership start date is not consistently considered
Membership records have both startDate and endDate, but active-membership logic primarily checks status and end date. A future membership could potentially be treated as usable before it starts. (GitHub)
Required change
Eligibility must include:
status = active
startDate <= today
endDate >= today


22. Refund cancellation does not reconcile existing bookings
File
src/server/routers/payments.ts

The refund procedure changes payment and associated membership state, but the larger workflow does not visibly reconcile future booked classes, waitlists or credits already committed by that membership. (GitHub)
Required change
Characterize the current refund contract, then decide whether refund should:
Cancel future bookings
Keep already-booked classes valid
Restore or remove credits
Remove waitlist entries
This should not be guessed during refactoring.

23. Subscription writes are not atomic
File
src/server/routers/plans.ts

The code inserts a membership and then separately inserts a payment. If the payment insert fails, the membership can remain without a payment record. (GitHub)
Required change
Use a Drizzle transaction for:
Create membership
+ create payment


24. Payment references can collide
File
src/server/routers/plans.ts

References use:
`PAY-${Date.now()}`

Two requests in the same millisecond can generate the same reference, and the schema does not make the field unique. (GitHub)
Required change
Use a UUID or cryptographically random payment reference and add a unique constraint if references are business identifiers.

4. Kiosk and attendance issues
5. The kiosk can block a valid booking because the current membership has zero credits
File
src/app/kiosk/page.tsx

The kiosk examines the latest membership and calculates whether it is expired or has zero credits.
A member may have already spent their final credit when they booked the class. Having zero remaining credits at check-in should not invalidate an already-confirmed booking. (GitHub)
Required change
Check-in eligibility should be based on:
Confirmed booking status
Correct class/check-in window
Account status
Duplicate check-in status
It should not require unused credits after booking.

26. Kiosk member lookup can return an arbitrary partial match
File
src/server/routers/members.ts

Lookup uses wildcard matching on both email and phone and then takes one result using .get().
Searching a partial value shared by several users can select an arbitrary row. (GitHub)
Required change
For kiosk lookup:
Use exact normalized email or phone matching, or
Return a list of matching members and require staff selection.
Do not silently select the first partial match.

27. Attendance APIs do not enforce a check-in time window
The UI only asks for classes in the next two hours, but the server-side attendance mutation primarily verifies that the booking is confirmed. A direct API call could check someone into a class outside the intended window. (GitHub)
Required change
Enforce the check-in window inside the server service, not only through the UI query.
Example policy:
Check-in opens 30 minutes before class
Check-in closes 15 minutes after class starts

Use the actual current behaviour or document the chosen rule before enforcing it.

28. Check-in status and check-in insert are separate writes
Files
src/server/routers/bookings.ts
src/server/routers/corporate-bookings.ts

Attendance updates booking status and records check-in information through multiple operations. A failure between operations can leave inconsistent state. (GitHub)
Required change
Wrap attendance operations in one transaction and add a uniqueness guarantee preventing multiple check-ins for the same booking.

5. Trainer and class scheduling issues
6. Trainer availability accepts invalid time ranges
File
src/server/routers/trainers.ts

startTime and endTime are unrestricted strings. There is no server validation that:
They follow HH:mm.
Start is before end.
The range is non-empty. (GitHub)
Required change
Use schemas such as:
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

Then validate startTime < endTime.

30. Trainer availability uses UTC while the interface displays local time
Files
src/server/routers/trainers.ts
src/lib/format.ts
src/app/trainer/schedule/page.tsx

Availability checking uses getUTCDay(), getUTCHours() and getUTCMinutes(), while pages display dates through browser-local formatting. A trainer’s visible Tuesday schedule can therefore be validated against a different UTC weekday or time. (GitHub)
Required change
Define one business timezone, likely through a configuration value, and use it consistently in:
Class display
Booking cut-offs
Trainer availability
Reports
Seed data
Tests
Do not rely on deployment-server or browser timezone.

31. Trainer availability is not enforced during class creation or update
Files
src/server/routers/classes.ts
src/server/routers/trainers.ts

There is a separate availability-check procedure, but class creation and update do not call it. Staff can therefore bypass the check and create conflicting or out-of-hours classes. (GitHub)
Required change
Move the check into a shared class-scheduling service called directly by class creation and update.
The query endpoint can remain for UI previews, but the mutation must be authoritative.

32. Class updates can reduce capacity below current occupancy
File
src/server/routers/classes.ts

The update procedure accepts any positive capacity without checking existing bookings. An administrator could reduce a class from capacity 20 to 5 while 18 participants are confirmed. (GitHub)
Required change
Reject capacity below combined confirmed occupancy or require an explicit over-capacity override with documented behaviour.

33. Trainer assignment is not strongly validated
Class creation accepts a trainerId, but it does not visibly verify that the user exists, is active and has the trainer role. (GitHub)
Required change
Validate:
User exists
role = trainer
active = true

before assigning.

6. Notification problems
7. Deactivated members receive broadcasts
File
src/server/routers/notifications.ts

The variable is named activeMembers, but its query filters only by role = member. It does not filter active = true. (GitHub)
Required change
Filter using both role and active status.

35. Waitlist promotions do not create notifications
The database supports waitlist_promotion notifications, but neither promotion flow inserts such a notification. (GitHub)
Required change
The unified promotion transaction should create a notification after successful eligibility and credit deduction.

36. Notification inputs are insufficiently validated
Broadcast title and message accept unrestricted strings, so empty or extremely large values can be sent through the API even if the frontend prevents some cases. (GitHub)
Required change
Add minimum and maximum lengths while preserving existing normal inputs.

7. Frontend behaviour and usability problems
8. Reschedule modal does not actually exclude the original class
File
src/components/reschedule-modal.tsx

The comment says the original class is excluded, but filtering only checks that the class name matches. The original class remains selectable, after which the server reports that the user already has a booking for it. (GitHub)
Required change
Filter by both:
same class name
AND class ID differs from original class ID

The modal currently does not receive the original class ID, so add it as a prop.

38. Reschedule errors can remain stale
The modal stores error state but does not clearly reset it when reopened, when another target class is selected or when it is closed by the overlay. (GitHub)
Required change
Reset modal state through one close handler:
function handleClose() {
  setSelectedClassId(null);
  setError(null);
  onClose();
}


39. All roles are redirected to the member dashboard after login
File
src/app/login/page.tsx

Every successful login goes to /dashboard, even though trainers and administrators have dedicated work areas. (GitHub)
Required change
Use the role returned by login:
member → /dashboard
trainer → /trainer/schedule
admin → /admin

This is a user-experience correction, so record the old redirect in the behaviour inventory before changing it.

40. Navigation shows member pages to admins and trainers
File
src/components/NavBar.tsx

Every authenticated user sees “My bookings” and “Waitlist”, including trainers and admins. Those links represent member-specific workflows. (GitHub)
Required change
Make navigation explicitly role-based.

41. Staff pages rely heavily on client-side role rendering
Several pages load user or protected data and then display an access-denied message based on client-side results. The tRPC backend still protects the data, but this produces unnecessary requests and weakens route organisation. (GitHub)
Required change
Use route groups and shared role layouts:
app/(member)/
app/(staff)/
app/(admin)/

Keep server-side tRPC authorization as the real security boundary.

42. Important frontend files use any
For example, kiosk member state uses any, and some admin company data handling also loses inferred types. This removes one of the main benefits of tRPC and strict TypeScript. (GitHub)
Required change
Derive types from router output:
type MemberLookup =
  RouterOutputs["members"]["lookupByEmailOrPhone"];


8. Database integrity problems
9. Important uniqueness rules are enforced only in application code
The schema lacks database-level uniqueness for several business rules, including:
Trainer and weekday availability
Company membership rules
Check-in per booking
Active booking duplication
Payment references (GitHub)
Application-level “check then insert” logic is vulnerable to concurrent requests.
Required change
Add appropriate unique constraints or indexes where the business rule is definite.
Be careful with active bookings because uniqueness depends on status. SQLite partial indexes may be appropriate:
CREATE UNIQUE INDEX ...
WHERE status IN ('booked', 'waitlisted');


44. Multi-step business operations lack transactions
The following workflows perform several related database operations separately:
Membership plus payment creation
Booking plus credit deduction
Cancellation plus credit refund
Waitlist promotion plus credit deduction
Rescheduling
Check-in
Class cancellation
Corporate top-up balance updates (GitHub)
Required change
Use transactions around business invariants, not around every simple query.
High-priority transaction boundaries:
bookClass()
cancelBooking()
promoteWaitlist()
rescheduleBooking()
checkIn()
subscribeToPlan()
refundPayment()
cancelClass()


45. Common query columns lack visible indexes
Frequently filtered data includes:
Booking userId, classId, status
Corporate booking userId, classId, companyId, status
Class startsAt
Membership userId, status, endDate
Notification userId, read
Check-in bookingId
The reviewed schema does not define indexes for these combinations. (GitHub)
Required change
Add indexes after collecting representative query patterns. This is a performance improvement and should not affect behaviour.

9. Reporting inaccuracies
10. Class utilisation is incomplete and potentially arbitrarily ordered
File
src/server/routers/admin.ts

Utilisation counts normal bookings only. The query also applies a limit without an obvious ranking criterion for “top” or “upcoming” classes, so the displayed subset may not be meaningful. (GitHub)
Required change
Define the report precisely:
Upcoming classes ordered by start time

or:
Highest-utilisation classes ordered descending

Then include both normal and corporate bookings.

47. Revenue reporting does not represent corporate credit purchases
Admin revenue is based on paid rows in the payments table. Corporate credit top-ups directly modify the company balance and do not create payment or transaction records. Corporate revenue and credit history therefore cannot be audited from the reports. (GitHub)
Required change
Add a corporate credit ledger:
company_credit_transactions
- companyId
- amount
- type: top_up | booking_charge | refund | adjustment
- reference
- createdBy
- createdAt

This is a larger schema decision. For the four-day project, documenting it clearly may be safer than implementing it unless tests and migrations are completed early.

10. Security and operational concerns
11. Session cookie is not explicitly marked secure in production
The authentication cookie is HTTP-only and SameSite Lax, but no secure option is shown. (GitHub)
Required change
secure: process.env.NODE_ENV === "production"


49. Expired sessions are not cleaned up
Context rejects expired sessions, but the expired rows remain in the database. (GitHub)
Required change
Either:
Delete the current expired session when encountered, and
Add periodic cleanup for old session rows.

50. Login and registration have no visible rate limiting
Authentication procedures are public and no rate-limiting layer is visible in the tRPC route or auth router. (GitHub)
Required change
Document for this exercise or add a minimal rate-limiting strategy if deployment is part of evaluation. Avoid spending excessive Day 3 time building production infrastructure unless required.

51. Demo credentials are presented directly on the login page
The login page displays administrator, trainer and member credentials. That is acceptable for a demonstration repository but must not remain in a production deployment. (GitHub)
Required change
Keep them only when an explicit demo environment variable is enabled.

11. Architecture and maintainability problems
12. Business logic is concentrated in large routers
The largest backend files combine validation, policy, database access, credit movement, waitlist management and response construction.
Examples include:
bookings.ts
corporate-bookings.ts
reschedules.ts
admin.ts

The normal and corporate routers repeat significant booking, cancellation, capacity and promotion logic. (GitHub)
Required change
Keep tRPC procedures as stable contracts and extract:
features/bookings/server/
├── booking-service.ts
├── cancellation-service.ts
├── waitlist-service.ts
├── capacity-service.ts
├── attendance-service.ts
├── booking-policy.ts
└── booking-errors.ts


53. Reschedule validation is duplicated
The rescheduling router contains separate validation and execution paths that repeat many rules. This makes it likely that one path will eventually differ from the other. (GitHub)
Required change
Create one side-effect-free function:
evaluateReschedule(input): RescheduleDecision

Use it in both preview validation and the actual mutation. The mutation should repeat authoritative database checks inside its transaction to prevent stale decisions.

54. Route pages handle too many responsibilities
Pages directly contain:
Data fetching
Mutation orchestration
Local state
Access handling
Formatting
Business eligibility decisions
Full rendering
The component folder contains very few shared components relative to the number of pages. (GitHub)
Required change
Keep pages as route-level composition:
export default function KioskPage() {
  return <CheckInKiosk />;
}

Move functionality into feature folders rather than creating one giant generic components folder.

55. Date and timezone behaviour is scattered
Date calculations appear independently in bookings, corporate bookings, rescheduling, plans, trainers, reports and frontend formatting. This creates inconsistent timezone and boundary behaviour. (GitHub)
Required change
Centralize:
hoursUntilClass
businessDate
isMembershipActive
isCancellationRefundable
formatBusinessDateTime

Do not change timezone semantics until characterization tests document them.

12. Testing and documentation status
13. Behaviour is effectively unprotected
package.json contains a Vitest command, but no test files were visible in the reviewed repository source tree. Therefore, the most sensitive business logic currently lacks visible automated regression protection. (GitHub)
Required change
Before refactoring, create characterization tests for:
Normal booking
Corporate booking
Capacity
Waitlist promotion
Cancellation refunds
Rescheduling transitions
Check-in
Class cancellation
Payment refund
Session deactivation
Role authorization
Reports
Do not write only happy-path tests. Assert exact error codes, messages and database side effects.

Files that should receive the most attention
Priority 1 — Must be handled first
src/server/routers/bookings.ts
src/server/routers/corporate-bookings.ts
src/server/routers/reschedules.ts
src/server/routers/classes.ts
src/server/trpc.ts
src/db/schema.ts

These files contain the highest-risk correctness, credit and security problems.
Priority 2 — Important backend consistency
src/server/routers/plans.ts
src/server/routers/payments.ts
src/server/routers/members.ts
src/server/routers/admin.ts
src/server/routers/admin-companies.ts
src/server/routers/trainers.ts
src/server/routers/notifications.ts

Priority 3 — Frontend restructuring
src/app/dashboard/page.tsx
src/app/schedule/page.tsx
src/app/kiosk/page.tsx
src/app/trainer/schedule/page.tsx
src/app/admin/page.tsx
src/app/admin/companies/[id]/page.tsx
src/components/reschedule-modal.tsx
src/components/NavBar.tsx


What we should actually fix during the four days
Trying to fix all 56 findings while restructuring the code would be dangerous. The assignment rewards careful decisions, not maximum change.
Fix during the project
These are defensible and high-value:
Public roster data exposure
Deactivated-session access
Shared capacity calculation
Waitlist insufficient-credit bugs
Reschedule credit bugs
Missing reschedule waitlist promotion
Transactions for booking, cancellation and rescheduling
Reschedule modal original-class issue
Incorrect role navigation
Notification filtering
Trainer time validation
Characterization tests
Fix only with strong tests
These affect broader behaviour:
Unified corporate and normal waitlists
Complete class-cancellation refunds
Multiple active memberships
Refund and booking reconciliation
Corporate kiosk/check-in integration
Database uniqueness changes
Document clearly if time is insufficient
Corporate credit ledger
Unified booking data model
Missing admin management screens
Database indexing
Rate limiting
Production demo credentials
Full business-timezone migration


Recommended first-day audit documents
Create these immediately:
documents/
├── repository-audit.md
├── behavior-inventory.md
├── confirmed-defects.md
├── architecture-decisions.md
├── known-issues.md
├── test-matrix.md
└── refactor-map.md

Each defect should have this format:
ID: BOOK-001
Severity: Critical
Status: Confirmed from source / Reproduced
Area: Class capacity

Current behaviour:
Normal and corporate bookings calculate capacity independently.

Expected invariant:
Normal + corporate confirmed bookings must not exceed class capacity.

Affected files:
- src/server/routers/bookings.ts
- src/server/routers/corporate-bookings.ts
- src/server/routers/classes.ts

Decision:
Fix using a shared occupancy service.

Protection:
Characterization and regression tests added.

Commit:
<commit hash>

Overall assessment
The application has a useful domain and a manageable codebase, but the central problem is deeper than file size. The two separate booking systems have evolved without a shared definition of:
Capacity
Credit eligibility
Waitlist order
Attendance
Cancellation
Reporting
That should become the central story of the refactor:
We preserved the existing tRPC contracts and user-facing behaviour, while establishing shared domain services for occupancy, credits, waitlists, rescheduling and attendance. Confirmed defects were corrected with tests; ambiguous business decisions were documented rather than silently changed.
That is the strongest architecture defense for this project.

Here's the complete role-wise breakdown — everything split into what I said, what your document said, and the combined final list for each role. Architecture/security/DB issues that don't belong to one specific role are in their own section at the end.
________________________________________
👤 MEMBER
1. Features (from what I told you)
•	Sign in / session cookie auth
•	Browse schedule (/schedule)
•	Book a class → auto-waitlist if full
•	Cancel booking (12h free-cancellation window, auto-promotes next waitlisted person)
•	Reschedule booking (4h window, same class name only)
•	View/leave waitlist with queue position
•	View plans, subscribe (/plans)
•	Dashboard — bookings, membership status, credits, reschedule history
•	Notifications page with unread badge
2. Problems
A. What I said:
1.	No signup UI (backend register exists, no page)
2.	Corporate booking fully dead in the UI — schedule always calls personal bookings.book
3.	No real notifications ever fire (waitlist promotion, class cancelled, membership expiring — all unused types)
4.	No profile-edit UI (mutation exists, no form)
5.	Reschedule modal doesn't truly exclude the current class from the picker
B. What your document adds (new — I missed these):
 6. Class capacity can be exceeded — normal + corporate bookings counted separately, so a 20-cap class can seat 40 
7. Waitlists don't coordinate — normal and corporate waitlists are separate queues; no single fair chronological order 
8. Corporate waitlist promotion can create a free booking — status flipped to booked before checking company credits
 9. Normal waitlist promotion can overdraw a membership — promotes without checking credits, then floors at zero with Math.max(0, ...) instead of blocking 
10. Reschedule from a waitlisted booking creates a free confirmed booking — creditsUsed: 0 gets copied into a newly confirmed spot 
11. Reschedule to a full class can double-charge — non-zero creditsUsed carried into new waitlisted booking, deducted again on promotion 
12. Reschedule never promotes the old class's waitlist after freeing a seat 
13. Reschedule preserves the wrong credit cost — matches by class name only, ignores that same-named classes can cost different credits
 14. Class cancellation doesn't clean up member bookings properly — doesn't cancel waitlisted entries, doesn't refund credits, doesn't notify 
15. classes.byId publicly exposes the roster (names + emails) — no login required 
16. Member can belong to multiple companies ambiguously — which employer pays for a corporate booking can depend on row order 
17. Multiple simultaneous active memberships possible — no check before plans.subscribe inserts a new one 
18. Dashboard membership and booking-eligibility membership can disagree — different queries can pick different membership records 
19. Membership startDate never checked — a future-dated membership could theoretically be used before it starts 
20. Refund doesn't reconcile existing bookings — refunding a payment cancels the membership but leaves future bookings/waitlist/credits untouched
 21. Subscription isn't atomic — membership insert and payment insert are separate; failure between them leaves an orphaned membership 
22. Payment references can collide (PAY-${Date.now()}, no uniqueness)
 23. Waitlist promotion never sends a notification (specific case of #3, but the doc frames it as a distinct defect with a required fix) 
24. Reschedule modal error state doesn't reset when reopened/reselected/closed via overlay
 25. After login, every role (including member) goes to /dashboard — not itself a member problem, but member-specific dashboard logic is what gets forced on everyone 
26. Kiosk can wrongly block a valid check-in — if a member already spent their last credit booking the class, having zero credits at check-in shouldn't invalidate the booking, but it does
C. Final combined list (all member-facing problems): items 1–26 above, all confirmed present in the code.
________________________________________
🏋️ TRAINER
1. Features (from what I told you)
•	Sign in, role-gated /trainer/schedule
•	View own upcoming classes with booked-count / checked-in-count
•	Set/edit/remove weekly availability
•	Access to /kiosk (shared with admin) for check-ins
2. Problems
A. What I said:
1.	Can't cancel or edit own classes (no UI, and endpoints are staff/admin-only anyway)
2.	Can't see roster by name, only aggregate counts
3.	trainers.checkAvailability exists but is never called from anywhere in the app
B. What your document adds (new): 
4. Trainer roster and admin utilisation reports both ignore corporate bookings — a trainer's "booked count" undercounts real attendance 

 6. Availability checked in UTC, but the UI displays local time — getUTCDay()/getUTCHours() used in checkAvailability, while pages format dates in browser-local time — a trainer's visible "Tuesday" slot can be checked against the wrong day/time entirely 
7. Availability is never enforced during class creation or update — same root issue as "checkAvailability never called," but the doc frames it as: staff can create/update classes that conflict with or fall outside a trainer's stated hours, with no server-side block 
8. Trainer assignment on class creation isn't validated — nothing confirms the assigned trainerId belongs to an existing, active user with the trainer role 
9. Corporate check-ins aren't linked to a trainer's classes at all — checkins.bookingId only foreign-keys to normal bookings, so a trainer's class stats can be silently incomplete for corporate attendees 
10. Date/timezone logic is scattered across bookings, corporate bookings, rescheduling, plans, trainers, and formatting — inconsistent handling specifically hits trainer availability math (see #6)
C. Final combined list (all trainer-facing problems): items 1–10 above.
________________________________________
🛠️ ADMIN
1. Features (from what I told you)
•	/admin dashboard — stats, class utilisation, recent payments
•	/admin/attendance — check-ins/day, top trainers, no-show list
•	/admin/reports — revenue by month/method, refunds, expiring memberships
•	/admin/announcements — broadcast to all members
•	/admin/companies + /admin/companies/[id] — full corporate CRUD
•	/kiosk — member lookup + check-in
2. Problems
A. What I said:
1.	No member-management UI (search/byId/setActive/setRole all backend-only)
2.	No class-scheduling UI (create/update/cancel all backend-only)
3.	No plan-management UI (create/setActive backend-only)
4.	No payments-action UI (markPaid/refund backend-only — dashboard only displays payments)
5.	no_show status is dead — nothing in the live app ever sets it, only seed data does, so the no-show report can never populate from real usage
6.	Companies/Reports/Announcements pages aren't in the NavBar, only reachable via /admin or direct URL
7.	Kiosk's expired-membership/no-credit warnings are cosmetic — client-side only, markAttended doesn't re-verify server-side
B. What your document adds (new): 
8. Corporate waitlist promotion can create a free booking (also a member issue, but the cause — checking credits after promoting instead of before — is an admin/business-rule design flaw in corporate-bookings.ts) 
9. Class cancellation is badly incomplete as an admin action — marks class cancelled, cancels only booked normal bookings; leaves waitlisted entries active, ignores corporate bookings entirely, never refunds credits (personal or company), never notifies anyone — despite a class_cancelled notification type existing unused 
10. payments.refund doesn't reconcile bookings — admin can refund a payment while the member keeps their already-booked classes and spent credits untouched, with no defined policy either way 
11. Class updates can reduce capacity below current occupancy — an admin can drop a class from 20 → 5 capacity while 18 people are already confirmed, with no check 12. Class utilisation report only counts normal bookings and applies a limit with no defined ranking (not clearly "soonest" or "highest utilisation") — the "top classes" shown may be arbitrary 
13. Revenue reporting excludes corporate credit purchases entirely — corporate top-ups mutate creditPoolBalance directly with no payment/ledger record, so admin reports can't audit corporate revenue or credit history 
14. Deactivated members still receive broadcast announcements — the code names the variable activeMembers but the query filters only role = "member", never active = true (confirmed in source) 
15. Broadcast title/message have no length validation — empty or oversized announcements can be sent via direct API call 
16. Deactivated users retain live sessions — deactivating a user via members.setActive doesn't invalidate their existing session token, so they can keep using the app until it expires naturally (up to 30 days) 
17. Kiosk member lookup can silently match the wrong person — wildcard LIKE search on email/phone takes the first .get() result rather than requiring an exact match or listing all candidates 
18. No server-side check-in time window — front desk/kiosk UI only shows classes in the next 2 hours, but nothing on the server stops checking someone into a class hours away via direct API call
 19. Check-in status update and check-in record insert are separate, non-transactional writes — a failure between them leaves inconsistent state 
20. Trainer/kiosk/admin attendance flows can't fully account for corporate check-ins — checkins.bookingId only links to normal bookings, so admin attendance reports can undercount or lose corporate attendance data entirely
C. Final combined list (all admin-facing problems): items 1–20 above.








________________________________________
🔒 SYSTEM-WIDE / CROSS-ROLE / ARCHITECTURE
(Not specific to one role — I did not mention any of these; all are new from your document.)
Security
1.	classes.byId is publicProcedure but returns member names + emails — should be split into a public class-details endpoint and a staff-only roster endpoint
2.	Session cookie has no explicit secure: true flag for production
3.	Expired sessions are never cleaned up — rejected on use, but rows persist forever
4.	No rate limiting on login/register
5.	Demo credentials (admin/trainer/member) are hardcoded on the login page — fine for demo, must be gated behind an env flag for production
Database integrity
6.	No DB-level uniqueness for: trainer/weekday availability, one active company per member, one check-in per booking, one active booking per class, payment references — all enforced only in application code and vulnerable to race conditions
7.	No transactions around multi-step operations: booking+credit deduction, cancellation+refund, waitlist promotion+credit deduction, rescheduling, check-in, subscription+payment, class cancellation, corporate top-up
8.	No indexes on frequently-filtered columns (bookings.userId/classId/status, classes.startsAt, memberships.userId/status/endDate, notifications.userId/read, checkins.bookingId)
Frontend/UX (affects all roles)
9.	Every role is redirected to /dashboard after login, regardless of role — trainers and admins land on a member page first
10.	NavBar shows member-only links ("My bookings," "Waitlist") to trainers and admins too — no role-based filtering
11.	Heavy reliance on client-side role gating (fetch data → show "Access denied") instead of route-group-level organization; real security boundary is still the tRPC procedure, but it's architecturally messy and wastes requests
12.	any types used in kiosk and admin-company pages, defeating tRPC's type safety end-to-end
Code architecture
13.	Business logic concentrated in large routers (bookings.ts, corporate-bookings.ts, reschedules.ts, admin.ts) with significant duplicated logic between normal and corporate flows
14.	Reschedule validation is duplicated — reschedule (mutation) and validateReschedule (query) implement the same rules separately, risking future drift between preview and actual execution
15.	Route pages handle too many responsibilities (data fetching + mutation orchestration + state + access control + formatting + business rules + rendering, all in one file)
16.	Date/timezone logic is scattered independently across bookings, corporate bookings, rescheduling, plans, trainers, and formatting — no single source of truth
Testing
17.	vitest is configured in package.json but there are no test files anywhere in the repo — none of the credit/waitlist/capacity/reschedule logic above has any automated regression protection today

