import { TRPCError } from "@trpc/server";

/**
 * Shared, pure booking-eligibility policy for both personal
 * (`bookings.book`) and corporate (`corporateBookings.book`) — the two
 * mutations had identical class-validity and duplicate-booking checks
 * before this extraction (Phase 2 item 2 of restructure-plan.md). Not
 * responsible for: membership/company credit eligibility (that stays in
 * each router — the two sources check different things, a personal
 * membership vs. a company credit pool, so there's nothing shared to
 * extract there) or capacity/waitlist decisions (`capacity-service.ts`,
 * `waitlist-service.ts`).
 *
 * `hoursUntil` is also imported from here by `reschedules.ts` (Phase 2
 * item 6 closed what used to be a third local copy there) — no separate
 * `business-time.ts` module was needed; see that item's log entry.
 */

/** Hours between `now` and an ISO timestamp (negative if `iso` is in the past). */
export function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

/**
 * @throws BAD_REQUEST if the class is cancelled or has already started
 */
export function assertClassBookable(cls: { cancelled: boolean; startsAt: string }): void {
  if (cls.cancelled) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    });
  }
  if (hoursUntil(cls.startsAt) <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This class has already started.",
    });
  }
}

/**
 * @throws CONFLICT if `existing` is truthy (caller already has an
 *   active booked/waitlisted row for this class)
 */
export function assertNoActiveBooking(existing: unknown): void {
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on the list for this class.",
    });
  }
}
