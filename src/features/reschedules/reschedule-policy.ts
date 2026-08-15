import { and, eq, sql } from "drizzle-orm";
import { bookings, classes, memberships } from "@/db/schema";
import { isClassFull } from "@/features/bookings/capacity-service";
import { UNLIMITED_CREDITS } from "@/server/routers/bookings";

/**
 * Phase 2.3 of restructure-plan.md: `reschedule` (mutation) and
 * `validateReschedule` (query) used to implement the same rules twice
 * (plan.md item #53) — this is that shared, side-effect-free decision
 * function. Not responsible for: any writes. `reschedule` performs the
 * actual insert/update/promote steps itself, using this function's
 * returned decision; `validateReschedule` maps the same decision to its
 * own `{valid, reason}`/`{valid, targetIsFull}` shape.
 *
 * `FREE_RESCHEDULE_HOURS` and `hoursUntil` still live in
 * `reschedules.ts` (not moved here) — `hoursUntil` has a third copy
 * there beyond `bookings.ts`'s/`corporate-bookings.ts`'s, deliberately
 * left for Phase 2 item 6 (`business-time.ts`) rather than partially
 * deduping it mid-way through this extraction.
 *
 * Known, minor, non-behavioral difference from the original two
 * call sites: the original `validateReschedule` only fetched the
 * membership row when `becomingConfirmed` was true; the original
 * `reschedule` mutation fetched it whenever `originalBooking.membershipId`
 * existed, regardless of `becomingConfirmed` (needed later for the
 * RESCH-002 refund path). This function always fetches it when
 * `membershipId` exists, matching the mutation's behavior — so a preview
 * call that isn't `becomingConfirmed` now runs one extra read query it
 * didn't before. No output or DB-write difference; call sites' returned
 * shapes are unchanged. Noted here for honesty, not hidden.
 */

export type RescheduleDecision =
  | {
      valid: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT";
      reason: string;
    }
  | {
      valid: true;
      originalBooking: typeof bookings.$inferSelect;
      originalClass: typeof classes.$inferSelect;
      targetClass: typeof classes.$inferSelect;
      targetIsFull: boolean;
      becomingConfirmed: boolean;
      becomingWaitlisted: boolean;
      membership: typeof memberships.$inferSelect | null;
      newCreditsUsed: number;
    };

export async function evaluateReschedule(
  db: typeof import("@/db").db,
  userId: number,
  input: { fromBookingId: number; toClassId: number },
  freeRescheduleHours: number,
  hoursUntil: (iso: string, now?: Date) => number,
): Promise<RescheduleDecision> {
  const originalRow = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, input.fromBookingId))
    .get();

  if (!originalRow) {
    return { valid: false, code: "NOT_FOUND", reason: "Booking not found." };
  }

  const originalBooking = originalRow.booking;
  const originalClass = originalRow.cls;

  if (originalBooking.userId !== userId) {
    return { valid: false, code: "FORBIDDEN", reason: "You cannot reschedule this booking." };
  }

  if (originalBooking.status !== "booked" && originalBooking.status !== "waitlisted") {
    return { valid: false, code: "BAD_REQUEST", reason: "This booking is no longer active." };
  }

  const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
  if (hoursBeforeOriginal < freeRescheduleHours) {
    return {
      valid: false,
      code: "BAD_REQUEST",
      reason: `You can only reschedule up to ${freeRescheduleHours} hours before the class starts.`,
    };
  }

  const targetClass = await db.select().from(classes).where(eq(classes.id, input.toClassId)).get();
  if (!targetClass) {
    return { valid: false, code: "NOT_FOUND", reason: "Target class not found." };
  }

  if (targetClass.name !== originalClass.name) {
    return { valid: false, code: "BAD_REQUEST", reason: "You can only reschedule to a class with the same name." };
  }

  // RESCH-004, fixed: same-named classes aren't required to share a
  // creditCost — reject the reschedule outright on a mismatch rather
  // than silently over/under-charging on any of the four transitions.
  if (targetClass.creditCost !== originalClass.creditCost) {
    return {
      valid: false,
      code: "BAD_REQUEST",
      reason: "You can only reschedule to a class with the same credit cost.",
    };
  }

  if (targetClass.id === originalClass.id) {
    return { valid: false, code: "BAD_REQUEST", reason: "You are already booked for this class." };
  }

  if (hoursUntil(targetClass.startsAt) <= 0) {
    return { valid: false, code: "BAD_REQUEST", reason: "This class has already started." };
  }

  if (targetClass.cancelled) {
    return { valid: false, code: "BAD_REQUEST", reason: "This class has been cancelled." };
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, targetClass.id),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existingBooking) {
    return { valid: false, code: "CONFLICT", reason: "You already have an active booking for this class." };
  }

  // CORP-002, fixed — combined personal + corporate occupancy, not
  // personal bookings alone.
  const targetIsFull = await isClassFull(db, targetClass.id, targetClass.capacity);

  const becomingConfirmed = originalBooking.status === "waitlisted" && !targetIsFull;
  const becomingWaitlisted = originalBooking.status === "booked" && targetIsFull;

  const membership = originalBooking.membershipId
    ? await db.select().from(memberships).where(eq(memberships.id, originalBooking.membershipId)).get()
    : null;

  if (becomingConfirmed && membership) {
    const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
    if (!unlimited && membership.creditsRemaining < targetClass.creditCost) {
      return { valid: false, code: "FORBIDDEN", reason: "Not enough class credits remaining." };
    }
  }

  const newCreditsUsed = becomingConfirmed
    ? targetClass.creditCost
    : becomingWaitlisted
      ? 0 // RESCH-002: waitlisted always means unspent, never a carried-over charge
      : originalBooking.creditsUsed; // Keep the same credits used

  return {
    valid: true,
    originalBooking,
    originalClass,
    targetClass,
    targetIsFull,
    becomingConfirmed,
    becomingWaitlisted,
    membership: membership ?? null,
    newCreditsUsed,
  };
}
