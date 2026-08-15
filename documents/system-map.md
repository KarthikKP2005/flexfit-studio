# System Map

`Page → tRPC procedure → validation/permissions → business rules → DB tables → side effects`,
for every procedure in the app, per plan.md's own requested format. Grouped
by router. **UI caller** column says which page(s) actually call it, or
**"none"** if it's backend-only (a real, working procedure with no frontend
wired to it — a known category of gap, see `known-issues.md`'s `MEMBER-005`,
`ADMIN-*`, `PAY-*` entries and plan.md's own list of these).

---

## `auth` — session cookie auth, no OAuth/JWT

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `me` | public | most pages (role gate) | returns `ctx.user` as-is (see `AUTH-001`: includes `passwordHash`) |
| `login` | public | `/login` | validate email+password → reject if inactive (`FORBIDDEN`) → verify hash → insert `sessions` row, set cookie |
| `register` | public | `/signup` | validate unique email → hash password → insert `users` (role `member`) → auto-login (session+cookie) |
| `logout` | protected | NavBar | delete the `sessions` row for the current token, clear cookie |
| `forgotPassword` | public | `/forgot-password` | (stub/no-op-style flow — no real email delivery) |

**Not covered by `createContext`:** `user.active` is checked at `login` but
never re-checked for an existing session (`AUTH-005`, documented not fixed).

---

## `members` — member profile + admin member lookup

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `profile` | protected | `/profile`, `/dashboard` | fetches user + membership via `getCurrentMembership` (`MEMBER-002`/`006`, fixed) |
| `updateProfile` | protected | `/profile` | updates own name/phone/email |
| `search` | staff | `/kiosk` (partial), admin | wildcard email/phone match (`MEMBER-001`, documented not fixed — can match the wrong person) |
| `byId` | staff | admin member detail | full profile lookup by id |
| `setActive` | admin | **none** — `adminMembers.toggleActive` used instead | flips `users.active`; doesn't touch `sessions` (`AUTH-005`) |
| `setRole` | admin | **none** | flips `users.role`; silently returns `undefined` for a bad id (`MEMBER-003`, documented not fixed) |
| `lookupByEmailOrPhone` | staff | `/kiosk` | same wildcard-match caveat as `search` |

---

## `plans` — membership plans + subscription

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `list` | public | `/plans` | active plans only |
| `subscribe` | protected | `/plans` | reject if an active membership already exists (`PLAN-001`, fixed) → insert `memberships` + `payments` atomically (`PLAN-002`/`003`, fixed) |
| `create` | admin | `/admin/plans` (via `adminPlans.create`, not this) | **none** directly |
| `setActive` | admin | **none** — `adminPlans.toggleActive` used instead | silently returns `undefined` for a bad id (`PLAN-004`, documented not fixed) |

---

## `classes` — public schedule + staff class CRUD

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `list` | public | `/schedule`, trainer/admin views | `spotsLeft` computed from personal `bookings` only (display-accuracy gap, `CORP-002`'s fix note) |
| `publicById` | public | class detail (no roster) | class info only — roster split out (`CLASS-001`, fixed) |
| `create` | staff | **none** — `adminClasses.create` used instead | validates trainer role, calls `isTrainerAvailable` |
| `update` | staff | **none** | validates trainer availability if trainer/time changed; capacity not checked against occupancy (`CLASS-002`, documented not fixed) |
| `cancel` | admin | **none** — `adminClasses.cancel` used instead | calls shared `cancelClass()` service (`CLASS-004`, fixed) |

**Duplication:** `classes.ts` and `adminClasses.ts` both implement `create`;
only `adminClasses`'s is wired to the UI (see `architecture-decisions.md`'s
2026-08-15 entry, and Phase 2 item 5 of `restructure-plan.md`).

---

## `adminClasses` — the router the admin UI actually uses for scheduling

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `list` | admin | `/admin/classes` | all classes + trainer name |
| `create` | admin | `/admin/classes` | validates trainer role + `isTrainerAvailable` before insert |
| `cancel` | admin | `/admin/classes` | calls shared `cancelClass()` (`CLASS-005`, fixed — previously did its own incomplete inline update) |
| `swapTrainer` | admin | `/admin/classes` | validates trainer role + `isTrainerAvailable` before reassigning (`TRAINER-003`, fixed) |

---

## `bookings` — personal (membership-credit) bookings

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `mine` | protected | `/dashboard` | upcoming personal bookings |
| `book` | protected | `/schedule` | eligibility (membership active, not cancelled/started, not duplicate) → capacity check (`capacity-service.ts`, `CORP-002` fixed) → booked or waitlisted |
| `cancel` | protected | `/dashboard` | refund if ≥12h out → `promoteNextWaitlisted` (`CORP-003`, fixed) on the freed seat |
| `admitFromWaitlist` | staff | trainer roster, kiosk | manually promotes a waitlisted booking |
| `markAttended` | staff | trainer roster, kiosk | booking → `attended`, insert `checkins` row |
| `rosterFor` | staff | trainer roster | all personal bookings for a class, staff-only (moved off public `classes.byId`, `CLASS-001`) |
| `upcomingForMember` | staff | `/kiosk` | member's classes in the next 2h window |
| `checkinCountFor` | staff | trainer schedule cards | count only, personal bookings |
| `waitlisted` | protected | `/waitlist` | member's own waitlist entries + queue position |

---

## `corporateBookings` — company-credit-pool bookings

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `mine` | protected | `/dashboard`, `/schedule` | upcoming corporate bookings |
| `book` | protected | `/schedule` | same eligibility shape as personal `book`, charged against `companies.creditPoolBalance` (`CORP-005`, fixed — UI wiring) |
| `cancel` | protected | `/dashboard` | 24h window (vs 12h personal) → `promoteNextWaitlisted` |
| `admitFromWaitlist` | staff | trainer roster | credit-checked before promoting (`CORP-001`, fixed) |
| `markAttended` | staff | trainer roster **only** — **not** `/kiosk` (`KIOSK-002`, documented not fixed) | booking → `attended`; `checkins.bookingId` always `null` (`CORP-004`, documented not fixed) |
| `rosterFor` | staff | trainer roster | merged into the same roster view as personal (`bookings.rosterFor` + this, called together) |
| `myCompany` | protected | `/dashboard`, `/schedule` | which company (if any) the member is linked to, and its credit balance |

---

## `reschedules` — moving a booking to another instance of the same class

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `reschedule` | protected | reschedule-modal | validates same-name target, equal credit cost (`RESCH-004`, fixed) → explicit credit policy per transition (`RESCH-001`/`002`, fixed) → promotes the *original* class's waitlist after freeing its seat (`RESCH-003`, fixed) |
| `history` | protected | `/dashboard` | past reschedules for the member |
| `validateReschedule` | protected | reschedule-modal (preview) | side-effect-free preview of what `reschedule` would do |

---

## `payments` — payment records + refund

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `mine` | protected | **none** | member's own payment history |
| `all` | admin | `/admin` dashboard | recent payments list (display only) |
| `markPaid` | admin | **none** | flips a payment to `paid` — no UI action wired |
| `refund` | admin | **none** | cancels membership + dependent bookings/waitlist (`PAY-001`, fixed) — but **unreachable from any page** |

---

## `notifications` — bell icon + admin broadcast

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `unreadCount` | protected | NavBar bell badge | count of `read: false` |
| `list` | protected | `/notifications` | all notifications for the member |
| `markAllAsRead` | protected | `/notifications` | bulk update |
| `broadcast` | admin | `/admin/announcements` | inserts one row per active member — was sending to deactivated members too (`NOTIF-001`, documented not fixed) |

**Fires from:** waitlist promotion (`NOTIF-002`), class cancellation
(`NOTIF-003`), membership expiry cron (`NOTIF-004`) — all fixed.

---

## `trainers` — a trainer's own availability + preview check

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `upcomingClasses` | staff | `/trainer/schedule` | classes assigned to `ctx.user`, booked count personal-only (`CORP-002` follow-up, not yet fixed) |
| `availability` | staff | `/trainer/schedule` | own weekly availability rows |
| `setAvailability` | staff | `/trainer/schedule` | no HH:mm/range validation (`TRAINER-001`, documented not fixed) |
| `removeAvailability` | staff | `/trainer/schedule` | delete one day's row |
| `checkAvailability` | staff | **none** — only called server-side from inside `create`/`update`/`swapTrainer`, never as a live UI preview | UTC day/hour comparison (`TRAINER-002`, documented not fixed — UTC vs. trainer's local time) |

---

## `admin` — dashboards, reports, settings

| Procedure | Access | UI caller | Flow |
|---|---|---|---|
| `stats` | admin | `/admin` | member/membership/class/revenue/checkin/payment counts |
| `classUtilisation` | admin | `/admin` | personal bookings only, no defined ranking (`ADMIN-001`, documented not fixed) |
| `revenueByMonth` / `revenueByMethod` | admin | `/admin/reports` | from `payments` only — excludes corporate top-ups (`ADMIN-002`, documented not fixed) |
| `trainerPayroll` | admin | `/admin/reports` | attended-count-based |
| `settings` / `updateSettings` | admin | `/admin` (studio settings) | `studioSettings` table read/write |
| `runMembershipExpiryCheck` | admin | `/admin` (manual trigger) | same job the cron (`NOTIF-004`) runs automatically |
| `expiringMemberships` | admin | `/admin/reports` | memberships ending in 14 days |
| `refundCount` | admin | `/admin/reports` | count of `refunded` payments |
| `checkinsPerDay` / `topTrainers` | admin | `/admin/attendance` | 14-day attendance rollups |
| `noShowList` | admin | `/admin/attendance` | queries `status = 'no_show'` — always empty in a live system since nothing ever sets that status (documented in-code, no formal defect ID yet) |

---

## `adminCompanies` / `adminMembers` / `adminPlans` / `adminStaff` — admin CRUD surfaces

All `admin`-only, all with real UI pages (`/admin/companies`,
`/admin/members`, `/admin/plans`, `/admin/staff`) — the one part of the
original plan.md audit's "no admin UI" complaints that's now fully
resolved. `adminCompanies` covers company create/activate/credit
top-up/member link-unlink (`COMPANY-001`/`002`, fixed); `adminMembers`
covers member list/profile/credit-adjust/activate; `adminPlans` covers
plan create/toggle; `adminStaff` covers trainer creation + availability
management from the admin side.

---

## Backend-only procedures (real, working, no UI caller)

Cross-referenced against every `trpc.<router>.<procedure>` call actually
found under `src/app/**` and `src/components/**`:

- `plans.create` (superseded by `adminPlans.create`)
- `plans.setActive` (superseded by `adminPlans.toggleActive`, `PLAN-004` still open on the original)
- `classes.create` / `update` / `cancel` (superseded by `adminClasses.*`)
- `members.setActive` / `setRole` (superseded by `adminMembers.toggleActive`; `setRole` has no admin substitute at all — no UI exists to promote a member to trainer/admin)
- `payments.mine` / `markPaid` / `refund` — the biggest gap here: `refund` is fully fixed and correct (`PAY-001`) but genuinely unreachable from any page.
