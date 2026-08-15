# Behavior Inventory

Plan.md's requested format (User role / Starting data / Action / Input /
Output / Error code+message / DB side effects / UI change / Edge cases),
for the features `restructure-plan.md`'s Phase 2 will actually touch —
this is the behavior contract those extractions must not change. Not a
duplicate of `known-issues.md` (which documents *bugs*) or `system-map.md`
(which documents *routing*) — this documents *current correct behavior*,
including intentional quirks, so a REFACTOR has something concrete to be
verified against.

For the full defect-by-defect history (56 original findings, 50 tracked,
36 fixed), see `known-issues.md`. For the complete procedure list, see
`system-map.md`.

---

## Feature: Check-in / mark attended (target of Phase 2 item 1, `attendance-service.ts`)

| | Personal (`bookings.markAttended`) | Corporate (`corporateBookings.markAttended`) |
|---|---|---|
| **User role** | staff (trainer or admin) | staff |
| **Starting data** | a `booked` booking, class within the check-in window | same |
| **Action** | mark a member as attended | same |
| **Input** | `{ bookingId, source: "trainer" \| "kiosk" }` | `{ bookingId }` |
| **Output** | updated booking row | updated booking row |
| **Error — wrong status** | `BAD_REQUEST` "Only confirmed bookings can be checked in." | same message |
| **Error — outside window** | `BAD_REQUEST` (30 min before → end of class) | same window |
| **DB side effects** | `bookings.status → "attended"`; insert `checkins` row with real `bookingId` | `corporateBookings.status → "attended"`; insert `checkins` row with **`bookingId: null`** (`CORP-004`, documented, not fixed) |
| **UI change** | roster/kiosk button disables, row updates | roster only — **`/kiosk` never calls this at all** (`KIOSK-002`, documented, not fixed) |
| **Edge cases** | zero credits at check-in does **not** block (`KIOSK-001`, fixed — credits are spent at booking time, not check-in) | same credit non-block; company balance is untouched by check-in (only by booking/promotion) |

**Extraction must preserve:** the `checkins.bookingId: null` behavior for
corporate stays exactly as-is (that's `CORP-004`, a separate open defect —
do not fix it silently while extracting). The two check-in windows/status
checks must remain byte-for-byte identical after moving into a shared
`attendance-service.ts`.

---

## Feature: Book a class (target of Phase 2 item 2, `booking-policy.ts`)

| | Personal (`bookings.book`) | Corporate (`corporateBookings.book`) |
|---|---|---|
| **User role** | member (any signed-in user) | member linked to an active company |
| **Starting data** | active membership with credits, or unlimited plan | active company link with sufficient `creditPoolBalance` |
| **Action** | book a class | same |
| **Input** | `{ classId }` | `{ classId }` |
| **Output** | `{ status: "booked" \| "waitlisted" }` | same shape |
| **Error — cancelled/started class** | `BAD_REQUEST` | same |
| **Error — already booked/waitlisted** | `BAD_REQUEST` (checked across `bookings` only — `BOOK-DUP-001`, documented, no DB-level constraint) | checked across `corporateBookings` only |
| **Error — no active membership** | `BAD_REQUEST` | `BAD_REQUEST` "No active company link" |
| **Error — insufficient credits** | `BAD_REQUEST`, unless unlimited (`creditsRemaining >= 999`) | `BAD_REQUEST` if `creditPoolBalance < creditCost` |
| **DB side effects** | insert `bookings` row; deduct membership credits if booked (unlimited plans never decrement) | insert `corporateBookings` row; deduct `companies.creditPoolBalance` if booked |
| **Capacity check** | shared `isClassFull()` — counts **both** tables (`CORP-002`, fixed) | same shared function |
| **UI change** | `/schedule` book button → confirmation, or waitlist message | same page, company-credit path (`CORP-005`, fixed — wiring) |
| **Edge cases** | full class → `waitlisted`, `creditsUsed: 0` | same |

**Extraction must preserve:** the shared capacity check (already
extracted, `capacity-service.ts`) stays untouched; the duplicate-booking
check stays scoped to each table separately (that's `BOOK-DUP-001`'s
documented, not-yet-fixed gap — don't unify it silently while pulling out
shared eligibility logic).

---

## Feature: Waitlist promotion (already extracted — `waitlist-service.ts` — reference only, Phase 2 doesn't touch this)

| | |
|---|---|
| **User role** | system-triggered (from `cancel`, `reschedule`, `refund`) |
| **Starting data** | a freed seat on a class with a non-empty waitlist (either source) |
| **Action** | `promoteNextWaitlisted(db, class)` |
| **Business rule** | oldest `bookedAt` across **both** `bookings` and `corporateBookings` wins (`CORP-003`, fixed) |
| **DB side effects** | verify credit eligibility *before* promoting (`BOOK-004`/`CORP-001`, both fixed) → promote → deduct → insert `notification` (`NOTIF-002`, fixed) |
| **Edge case** | ineligible candidate is **skipped**, not left blocking the queue — walk continues to next-oldest |

---

## Feature: Reschedule (target of Phase 2 item 3, `reschedule-policy.ts`)

| | |
|---|---|
| **User role** | member, own booking only |
| **Starting data** | a `booked` or `waitlisted` personal booking, ≥4h before class start |
| **Action** | move to another instance of the **same-named** class |
| **Input** | `{ bookingId, targetClassId }` |
| **Output** | new booking row |
| **Error — window** | `BAD_REQUEST` if <4h out |
| **Error — different credit cost** | `BAD_REQUEST` (`RESCH-004`, fixed — target must cost the same) |
| **Error — not same class name / not found** | `BAD_REQUEST` / `NOT_FOUND` |
| **DB side effects** | cancel original → create new, with an explicit credit policy per transition (confirmed→confirmed, confirmed→waitlisted, waitlisted→confirmed, waitlisted→waitlisted — all four fixed, `RESCH-001`/`002`) → `promoteNextWaitlisted` on the **original** class's freed seat (`RESCH-003`, fixed) |
| **UI change** | reschedule-modal; excludes the original class from the picker by id, not just name (`RESCH-005`, fixed); error state resets on reopen (`RESCH-007`, fixed) |
| **Two code paths** | `reschedule` (mutation, authoritative) and `validateReschedule` (query, preview) implement the same rules independently — this is exactly what Phase 2 item 3 consolidates into one `evaluateReschedule()` |

**Extraction must preserve:** all four credit-transition outcomes exactly;
the equal-cost validation; the original-class waitlist promotion. This is
the highest-risk extraction in Phase 2 — most duplicated logic, most
edge cases already fixed once (regression here would be re-breaking four
previously-fixed defects at once).

---

## Feature: Class scheduling — create / cancel / reassign trainer (target of Phase 2 item 5, `classes`/`adminClasses` consolidation)

| | `adminClasses` (the one the UI uses) |
|---|---|
| **User role** | admin |
| **Action — create** | validates `trainerId` is an active trainer, calls `isTrainerAvailable` before insert |
| **Action — cancel** | calls shared `cancelClass()` — cancels all active bookings (both sources, both statuses), refunds credits, notifies affected members (`CLASS-005`, fixed) |
| **Action — swapTrainer** | validates trainer role + `isTrainerAvailable` before reassigning (`TRAINER-003`, fixed) |
| **DB side effects (cancel)** | `classes.cancelled → true`; `bookings`/`corporateBookings` → `cancelled`; credit refunds; `notifications` insert |
| **Edge case** | cancelling a class does **not** call `promoteNextWaitlisted` — correct, because cancelling a class cancels its entire waitlist too, there's no freed seat to promote into (confirmed in `CLASS-004`'s own known-issues.md entry) |

**Extraction must preserve:** exact same three behaviors, whether they end
up consolidated into one router or left as two — the open question is
*where* this logic lives, not *what* it does.

---

## Feature: Admin reports/utilisation/no-show (target of Phase 2 item 4, `admin.ts` split)

| Procedure | Current behavior | Known gap (must stay as-is unless separately FIXed) |
|---|---|---|
| `classUtilisation` | personal bookings only, `LIMIT` with no defined ranking | `ADMIN-001`, documented not fixed |
| `revenueByMonth`/`revenueByMethod` | from `payments` table only | `ADMIN-002`, documented not fixed — excludes corporate top-ups |
| `noShowList` | queries `status = 'no_show'` | always empty in a live system — nothing ever sets that status outside seed data |
| `checkinsPerDay`/`topTrainers` | 14-day rollup from `checkins` | corporate check-ins undercounted (`checkins.bookingId` always null for them, `CORP-004`) |

**Extraction must preserve:** every one of these known gaps, exactly as
listed. Splitting `admin.ts` into `src/features/reports/` and
`src/features/attendance/` is a pure move — none of these four rows
change during Phase 2 item 4; they're separate FIX candidates for Phase 5.
