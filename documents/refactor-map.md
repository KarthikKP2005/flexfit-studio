# Refactor Map

The target backend/frontend layout for Project 1 Item A, written *before*
Phase 2/3 of `restructure-plan.md` move anything — so the plan is
reviewable now, not reverse-engineered from a diff later. Per plan.md:
*"There is no one correct folder layout... we mark whether the structure
makes sense and whether you can explain why you picked it."* Every line
below has its reason attached for exactly that.

---

## Backend — `src/features/`

```
src/features/
├── bookings/
│   ├── capacity-service.ts          ✅ exists — isClassFull(), counts both booking sources (CORP-002)
│   ├── waitlist-service.ts          ✅ exists — promoteNextWaitlisted(), unified queue (CORP-003)
│   ├── class-cancellation-service.ts ✅ exists — cancelClass(), full cleanup (CLASS-004/005)
│   ├── attendance-service.ts        🎯 Phase 2.1 — dedupes markAttended (personal vs corporate
│   │                                    currently near-identical, two copies)
│   └── booking-policy.ts            🎯 Phase 2.2 — pure functions, no DB: membership-active,
│                                        class-not-cancelled/started, duplicate-booking checks,
│                                        currently duplicated inline in bookings.book and
│                                        corporateBookings.book
│
├── reschedules/
│   └── reschedule-policy.ts         🎯 Phase 2.3 — evaluateReschedule(), one side-effect-free
│                                        function used by both the reschedule mutation and the
│                                        validateReschedule preview query (plan.md item #53:
│                                        these two currently implement the same rules twice)
│
├── reports/
│   ├── utilisation-service.ts       🎯 Phase 2.4 — classUtilisation's query logic
│   └── revenue-service.ts           🎯 Phase 2.4 — revenueByMonth/revenueByMethod query logic
│
├── attendance/
│   └── no-show-service.ts           🎯 Phase 2.4 — noShowList + checkinsPerDay/topTrainers
│
├── trainers/
│   └── availability-service.ts      ✅ exists — isTrainerAvailable(), used by classes.ts,
│                                        adminClasses.ts, and trainers.ts's checkAvailability
│
├── memberships/
│   └── current-membership.ts        ✅ exists — getCurrentMembership(), shared resolver
│                                        (MEMBER-002/006)
│
└── classes/
    └── (consolidation target)       🎯 Phase 2.5 — classes.ts vs adminClasses.ts's duplicate
                                         create logic; see architecture-decisions.md's 2026-08-15
                                         entry for the two real options (consolidate vs. document
                                         an intentional split) — not decided yet, this row is a
                                         placeholder for whichever gets picked

src/lib/
└── business-time.ts                 🎯 Phase 2.6 — hoursUntilClass, businessDate,
                                         isMembershipActive, isCancellationRefundable,
                                         formatBusinessDateTime (plan.md item #55) — currently
                                         scattered across bookings.ts, corporate-bookings.ts,
                                         reschedules.ts, plans.ts, trainers.ts, lib/format.ts.
                                         Pure move — TRAINER-002's UTC-vs-local bug is NOT fixed
                                         by this, stays exactly as documented.
```

**Routers stay where they are** (`src/server/routers/*.ts`) — Rule 7 says
routers stay thin (validation + call a service + shape the response), not
that they move. Only their *contents* shrink as logic moves into
`src/features/`.

---

## Frontend — `src/features/*/components/`

```
src/features/
├── trainers/components/
│   └── TrainerScheduleView.tsx      🎯 Phase 3, priority 1 — extracted from
│                                        trainer/schedule/page.tsx (552 lines, the single
│                                        largest file in the app)
│
├── schedule/components/
│   └── ScheduleBrowser.tsx          🎯 Phase 3 — from schedule/page.tsx (369 lines)
│
├── dashboard/components/
│   └── MemberDashboard.tsx          🎯 Phase 3 — from dashboard/page.tsx (369 lines)
│
├── admin-classes/components/
│   └── ClassScheduler.tsx           🎯 Phase 3 — from admin/classes/page.tsx (296 lines) —
│                                        tied to the classes/adminClasses backend consolidation
│                                        above; do this extraction after that decision lands so
│                                        the component doesn't need a second rewrite
│
├── admin-companies/components/
│   └── CompanyDetail.tsx            🎯 Phase 3 — from admin/companies/[id]/page.tsx (285 lines)
│
├── kiosk/components/
│   └── CheckInKiosk.tsx             🎯 Phase 3 — from kiosk/page.tsx (224 lines) — plan.md
│                                        item #54's own literal example:
│                                        `export default function KioskPage() { return <CheckInKiosk /> }`
│
├── admin-companies/components/
│   └── CompanyList.tsx              🎯 Phase 3 — from admin/companies/page.tsx (183 lines)
│
├── admin-plans/components/
│   └── PlanManager.tsx              🎯 Phase 3 — from admin/plans/page.tsx (176 lines)
│
├── admin-dashboard/components/
│   └── AdminOverview.tsx            🎯 Phase 3 — from admin/page.tsx (176 lines)
│
└── admin-reports/components/
    └── ReportsView.tsx              🎯 Phase 3 — from admin/reports/page.tsx (170 lines)
```

Every page under `src/app/**` becomes route-level composition only —
`export default function X() { return <FeatureComponent /> }` — data
fetching, mutations, local state, and rendering all move into the
component. Verified against the real running app (`run` skill), not just
`tsc --noEmit`, per `architecture-decisions.md`'s note on why this was
deferred the first time.

---

## Deliberately NOT restructured

- **`src/db/schema.ts`** — left as-is. Item B says this is fine
  ("leaving the database alone is fine"); see `architecture-decisions.md`
  for the one-paragraph schema-stance decision (Phase 1 item 4).
- **Route groups** (`app/(member)/`, `app/(staff)/`, `app/(admin)/`) —
  Phase 4, deliberately last. Real Next.js routing changes carry the
  highest risk of visibly breaking the app; only attempted once
  everything above is solid.
- **`src/lib/format.ts`, `src/lib/password.ts`** — already reviewed
  (`architecture-decisions.md`, 2026-08-06 entry), single-purpose and
  small, nothing to extract.

---

## Reading this map

✅ = already built, before this session's Phase 0/1.
🎯 = target for Phase 2/3, not yet built — this file is the plan, not a
record of completed work. Check `EDIT_LOG.md` for what's actually landed.
