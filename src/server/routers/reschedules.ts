import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  reschedules,
  bookings,
  classes,
  memberships,
} from "@/db/schema";
import { router, protectedProcedure } from "../trpc";
import { promoteNextWaitlisted } from "@/features/bookings/waitlist-service";
import { UNLIMITED_CREDITS } from "./bookings";
import { evaluateReschedule } from "@/features/reschedules/reschedule-policy";

/**
 * Moving a personal booking from one class instance to another
 * same-named one. Same-named classes are not required to share a
 * `creditCost` (see the header comment on `classes` in `schema.ts`) —
 * `reschedule`/`validateReschedule` reject a target whose cost doesn't
 * match the original's (RESCH-004, fixed). Target-class capacity is
 * shared with bookings.ts/corporate-bookings.ts (CORP-002, fixed). The
 * two transitions that change confirmation status keep the
 * `creditsUsed: 0` <=> "unspent, waitlisted" invariant the rest of the
 * app already relies on: waitlisted -> confirmed charges the target's
 * cost up front (RESCH-001, fixed) and confirmed -> waitlisted refunds
 * what was already charged (RESCH-002, fixed). Cancelling a confirmed
 * original booking also promotes that class's own waitlist (RESCH-003,
 * fixed), the same way `bookings.ts`'s/`corporate-bookings.ts`'s own
 * `cancel` already do, via the shared `promoteNextWaitlisted`.
 *
 * `reschedule` (mutation) and `validateReschedule` (query) now share one
 * decision function, `evaluateReschedule`
 * (`src/features/reschedules/reschedule-policy.ts`, Phase 2.3 of
 * restructure-plan.md, closing plan.md item #53's duplication) —
 * previously each independently implemented the same validation steps.
 * The mutation still re-derives its own decision by calling
 * `evaluateReschedule` again rather than trusting a client-supplied
 * preview result, so a stale client-side preview can't be replayed into
 * a write with a decision that's no longer true.
 */

/**
 * Members may reschedule free of charge up to this many hours before the
 * original class starts. This is more generous than cancellation policy.
 */
export const FREE_RESCHEDULE_HOURS = 4;

/** Hours between `now` and an ISO timestamp (negative if `iso` is in the past). */
function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

/**
 * The membership this user should reschedule against: status "active"
 * and endDate >= today. Currently unused — reschedule copies the
 * *original booking's* membershipId instead of re-resolving this, so
 * this helper's result never actually affects behavior here (see the
 * comment at its one call site below).
 */
async function activeMembershipFor(
  db: typeof import("@/db").db,
  userId: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}

export const reschedulesRouter = router({
  /**
   * Moves the caller's booking from `fromBookingId`'s class to
   * `toClassId` (must share the same class name) — creates a new
   * booking, cancels the old one, and records the move.
   *
   * Credit handling — both status-changing transitions now keep the
   * "waitlisted == unspent (creditsUsed: 0)" invariant `bookings.book`
   * already establishes:
   * - waitlisted -> confirmed (RESCH-001, fixed): a waitlisted original
   *   has creditsUsed: 0 by definition. If the target isn't full, this
   *   confirms a brand-new seat — the same thing `bookings.book` does —
   *   so it's charged the same way: verified against the membership's
   *   remaining credits *before* confirming, using
   *   `originalBooking.membershipId` (the booking's own pointer, not a
   *   fresh lookup — same approach as BOOK-004's
   *   `tryPromotePersonalCandidate`), and `targetClass.creditCost` is
   *   what gets charged, not the stale original creditsUsed.
   * - confirmed -> waitlisted (RESCH-002, fixed): a `booked` original
   *   has already had its creditsUsed deducted from the membership once,
   *   at the time it was first booked. If the target is full, the new
   *   booking no longer represents a confirmed seat — so it's created
   *   with creditsUsed: 0, matching every other waitlisted booking, and
   *   the original deduction is refunded back to the membership (same
   *   `UNLIMITED_CREDITS` guard as everywhere else). Without this
   *   refund, a later promotion (BOOK-004, fixed) would charge the
   *   target's cost fresh, on top of a deduction that was never
   *   reversed — a double charge for one continuous booking. Skipped
   *   entirely if the original had 0 credits used already (nothing to
   *   refund) or its membership can no longer be resolved.
   * - booked -> booked and waitlisted -> waitlisted: still just carry
   *   `creditsUsed` forward unchanged, exactly as before.
   *
   * Waitlist promotion (RESCH-003, fixed): if the original booking was
   * `booked`, cancelling it frees a confirmed seat on the *original*
   * class — so after cancelling, the original class's own waitlist is
   * now promoted via the shared `promoteNextWaitlisted` (the same
   * function `bookings.ts`'s/`corporate-bookings.ts`'s `cancel` already
   * call), exactly mirroring the guard `bookings.ts`'s `cancel` uses
   * (`status === "booked"` only — a waitlisted original never held a
   * confirmed seat, so there's nothing to free on that class).
   *
   * Credit cost match (RESCH-004, fixed): plan.md names three possible
   * policies for same-named classes with different `creditCost`s —
   * reject the reschedule, charge/refund the difference, or scope
   * reschedules to a class-series entity that guarantees equal cost —
   * and states its own recommendation directly: "the safest
   * behaviour-preserving option is initially to validate equal credit
   * cost." That's the one implemented here: the target's `creditCost`
   * must equal the original's, or the reschedule is rejected outright,
   * for all four status transitions uniformly (not just the two RESCH-001/
   * RESCH-002 already handle). Charging/refunding the difference stays
   * documented in known-issues.md as the deliberately-not-taken, more
   * invasive alternative.
   *
   * @throws NOT_FOUND if the source booking or target class doesn't exist
   * @throws FORBIDDEN if the caller doesn't own the source booking, or
   *   (RESCH-001) the reschedule would confirm a waitlisted booking into
   *   a class the caller's membership can no longer afford
   * @throws BAD_REQUEST if the source booking is inactive, the reschedule
   *   window (>= FREE_RESCHEDULE_HOURS before the original class) has
   *   passed, the target class has a different name / a different
   *   creditCost (RESCH-004) / is the same class / has already started /
   *   is cancelled
   * @throws CONFLICT if the caller already has an active booking for the target class
   */
  reschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const decision = await evaluateReschedule(
        ctx.db,
        ctx.user.id,
        input,
        FREE_RESCHEDULE_HOURS,
        hoursUntil,
      );
      if (!decision.valid) {
        throw new TRPCError({ code: decision.code, message: decision.reason });
      }

      const {
        originalBooking,
        originalClass,
        targetClass,
        targetIsFull,
        becomingConfirmed,
        becomingWaitlisted,
        membership,
        newCreditsUsed,
      } = decision;

      // Create the new booking
      const newBooking = await ctx.db
        .insert(bookings)
        .values({
          classId: targetClass.id,
          userId: ctx.user.id,
          membershipId: originalBooking.membershipId,
          status: targetIsFull ? "waitlisted" : "booked",
          creditsUsed: newCreditsUsed,
        })
        .returning()
        .get();

      if (becomingConfirmed && membership && membership.creditsRemaining < UNLIMITED_CREDITS) {
        await ctx.db
          .update(memberships)
          .set({ creditsRemaining: membership.creditsRemaining - targetClass.creditCost })
          .where(eq(memberships.id, membership.id));
      }

      // RESCH-002: the original's creditsUsed was already deducted when
      // it was first booked. Since it's no longer a confirmed seat,
      // refund it now rather than leaving it charged with nothing to
      // show for it (and a second charge waiting at promotion time).
      if (
        becomingWaitlisted &&
        membership &&
        originalBooking.creditsUsed > 0 &&
        membership.creditsRemaining < UNLIMITED_CREDITS
      ) {
        await ctx.db
          .update(memberships)
          .set({ creditsRemaining: membership.creditsRemaining + originalBooking.creditsUsed })
          .where(eq(memberships.id, membership.id));
      }

      // Cancel the original booking
      await ctx.db
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        })
        .where(eq(bookings.id, originalBooking.id));

      // RESCH-003: cancelling a *confirmed* original booking frees a seat
      // on that class just like bookings.ts's/corporate-bookings.ts's own
      // cancel does — so promote its waitlist the same way. A waitlisted
      // original never held a confirmed seat, so there's nothing to free.
      if (originalBooking.status === "booked") {
        await promoteNextWaitlisted(ctx.db, originalClass);
      }

      // Record the reschedule
      await ctx.db.insert(reschedules).values({
        userId: ctx.user.id,
        fromBookingId: originalBooking.id,
        toBookingId: newBooking.id,
        fromClassId: originalClass.id,
        toClassId: targetClass.id,
      });

      return {
        ok: true,
        newBooking,
        newStatus: targetIsFull ? "waitlisted" : "booked",
      };
    }),

  /** The caller's past reschedules, newest first, with from/to class detail resolved via subqueries. */
  history: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: reschedules.id,
        rescheduledAt: reschedules.rescheduledAt,
        fromClassName: classes.name,
        fromClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        fromClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        toClassName: sql<string>`(
          SELECT ${classes.name} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
      })
      .from(reschedules)
      .innerJoin(classes, eq(reschedules.fromClassId, classes.id))
      .where(eq(reschedules.userId, ctx.user.id))
      .orderBy(desc(reschedules.rescheduledAt));
  }),

  /**
   * Preview version of `reschedule` — same checks (now literally the
   * same function, `evaluateReschedule`, Phase 2.3 — previously an
   * independently-maintained duplicate, plan.md item #53), but returns
   * `{ valid: false, reason }` instead of throwing, and never writes
   * anything. The mutation still re-derives its own decision by calling
   * `evaluateReschedule` again rather than trusting a client-supplied
   * preview result, so a stale preview can't be replayed into a write.
   */
  validateReschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const decision = await evaluateReschedule(
        ctx.db,
        ctx.user.id,
        input,
        FREE_RESCHEDULE_HOURS,
        hoursUntil,
      );
      if (!decision.valid) {
        return { valid: false, reason: decision.reason };
      }
      return { valid: true, targetIsFull: decision.targetIsFull };
    }),
});
