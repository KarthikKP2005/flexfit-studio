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
import { isClassFull } from "@/features/bookings/capacity-service";
import { UNLIMITED_CREDITS } from "./bookings";

/**
 * Moving a personal booking from one class instance to another
 * same-named one. Not responsible for: credit correctness across every
 * transition (see RESCH-002/004 in known-issues.md — a `booked` original
 * rescheduled into a full target class still keeps its nonzero
 * `creditsUsed` and can be double-charged on later promotion; the target
 * class's own `creditCost` is otherwise never reconciled against what
 * was originally charged) or promoting the original class's waitlist
 * after the move (see RESCH-003). Target-class capacity *is* shared with
 * bookings.ts/corporate-bookings.ts (CORP-002, fixed) — both `reschedule`
 * and `validateReschedule` below now call the same `isClassFull`. The
 * one transition that previously had no credit check at all —
 * waitlisted (0 credits) rescheduling into a class that isn't full,
 * becoming a free confirmed booking — is fixed (RESCH-001); see
 * `reschedule` below.
 *
 * `reschedule` (mutation) and `validateReschedule` (query) intentionally
 * duplicate the same validation steps rather than sharing one function —
 * see plan.md item #53. Left as-is in this pass (a REFACTOR extracting a
 * shared `evaluateReschedule` would be reasonable follow-up work, but
 * risks behavior drift between the preview and the real mutation if not
 * done carefully with its own characterization tests).
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
   * Credit handling (RESCH-001, fixed): a waitlisted original has
   * creditsUsed: 0 by definition (see bookings.ts's `book`). If the
   * target class isn't full, this reschedule confirms a brand-new seat —
   * the same thing `bookings.book` does — so it's now charged the same
   * way: verified against the membership's remaining credits *before*
   * confirming, using `originalBooking.membershipId` (the booking's own
   * pointer, not a fresh lookup — same approach as BOOK-004's
   * `tryPromotePersonalCandidate`), and `targetClass.creditCost` is what
   * gets charged and deducted, not the stale original creditsUsed. Every
   * other transition (booked -> booked, booked -> waitlisted,
   * waitlisted -> waitlisted) still just carries `creditsUsed` forward
   * unchanged, as before.
   *
   * Behavior notes (see known-issues.md, not fixed here):
   * - RESCH-002: a *paid* (booked) original rescheduled into a full
   *   target class keeps its nonzero creditsUsed while waitlisted, and
   *   can be charged again if later promoted.
   * - RESCH-003: never promotes anyone waitlisted for the class being
   *   left, even though this cancels a confirmed booking there.
   * - RESCH-004: doesn't validate or reconcile the target class's own
   *   creditCost against what was actually charged originally (except
   *   now for the one waitlisted -> confirmed transition above, where
   *   the target's creditCost is unavoidably the number actually charged).
   *
   * @throws NOT_FOUND if the source booking or target class doesn't exist
   * @throws FORBIDDEN if the caller doesn't own the source booking, or
   *   (new, RESCH-001) the reschedule would confirm a waitlisted booking
   *   into a class the caller's membership can no longer afford
   * @throws BAD_REQUEST if the source booking is inactive, the reschedule
   *   window (>= FREE_RESCHEDULE_HOURS before the original class) has
   *   passed, the target class has a different name / is the same class /
   *   has already started / is cancelled
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
      // Get the original booking with its class details
      const originalRow = await ctx.db
        .select({
          booking: bookings,
          cls: classes,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.id, input.fromBookingId))
        .get();

      if (!originalRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found.",
        });
      }

      const originalBooking = originalRow.booking;
      const originalClass = originalRow.cls;

      // Verify ownership
      if (originalBooking.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot reschedule this booking.",
        });
      }

      // Verify booking is still active
      if (originalBooking.status !== "booked" && originalBooking.status !== "waitlisted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This booking is no longer active.",
        });
      }

      // Verify reschedule is allowed (within 4 hours of original class)
      const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
      if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
        });
      }

      // Get target class
      const targetClass = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.toClassId))
        .get();

      if (!targetClass) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target class not found.",
        });
      }

      // Verify target class has the same name
      if (targetClass.name !== originalClass.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only reschedule to a class with the same name.",
        });
      }

      // Verify target class is not the same class
      if (targetClass.id === originalClass.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are already booked for this class.",
        });
      }

      // Verify target class hasn't started
      if (hoursUntil(targetClass.startsAt) <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This class has already started.",
        });
      }

      // Verify target class is not cancelled
      if (targetClass.cancelled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This class has been cancelled.",
        });
      }

      // Check if user already has an active booking for this class
      const existingBooking = await ctx.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.classId, targetClass.id),
            eq(bookings.userId, ctx.user.id),
            sql`${bookings.status} in ('booked', 'waitlisted')`,
          ),
        )
        .get();

      if (existingBooking) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an active booking for this class.",
        });
      }

      // Check if target class is full (CORP-002, fixed — combined
      // personal + corporate occupancy, not personal bookings alone).
      const targetIsFull = await isClassFull(ctx.db, targetClass.id, targetClass.capacity);

      // Only a waitlisted -> confirmed transition needs a credit check
      // (RESCH-001) — every other transition just carries the original
      // creditsUsed forward unchanged, as before.
      const becomingConfirmed = originalBooking.status === "waitlisted" && !targetIsFull;

      const membership = originalBooking.membershipId
        ? await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, originalBooking.membershipId))
            .get()
        : null;

      if (becomingConfirmed && membership) {
        const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
        if (!unlimited && membership.creditsRemaining < targetClass.creditCost) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not enough class credits remaining.",
          });
        }
      }

      const newCreditsUsed = becomingConfirmed
        ? targetClass.creditCost
        : originalBooking.creditsUsed; // Keep the same credits used

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

      // Cancel the original booking
      await ctx.db
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        })
        .where(eq(bookings.id, originalBooking.id));

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
   * Preview version of `reschedule` — same checks, but returns
   * { valid: false, reason } instead of throwing, and never writes
   * anything. See the file header for why this duplicates `reschedule`'s
   * logic instead of sharing it, and note that because the mutation
   * re-runs its own checks rather than trusting this preview, the two
   * paths can only drift apart silently if one is edited without the
   * other — there's no shared source of truth to keep them in sync.
   *
   * Includes the same RESCH-001 credit check as the mutation: a
   * waitlisted original reschedule into a non-full target now previews
   * as invalid (with the same "Not enough class credits remaining."
   * reason) if the membership can't afford the target class's cost,
   * instead of always previewing as valid.
   */
  validateReschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get the original booking with its class details
      const originalRow = await ctx.db
        .select({
          booking: bookings,
          cls: classes,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.id, input.fromBookingId))
        .get();

      if (!originalRow) {
        return { valid: false, reason: "Booking not found." };
      }

      const originalBooking = originalRow.booking;
      const originalClass = originalRow.cls;

      // Verify ownership
      if (originalBooking.userId !== ctx.user.id) {
        return { valid: false, reason: "You cannot reschedule this booking." };
      }

      // Verify booking is still active
      if (
        originalBooking.status !== "booked" &&
        originalBooking.status !== "waitlisted"
      ) {
        return {
          valid: false,
          reason: "This booking is no longer active.",
        };
      }

      // Verify reschedule is allowed (within 4 hours of original class)
      const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
      if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
        return {
          valid: false,
          reason: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
        };
      }

      // Get target class
      const targetClass = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.toClassId))
        .get();

      if (!targetClass) {
        return { valid: false, reason: "Target class not found." };
      }

      // Verify target class has the same name
      if (targetClass.name !== originalClass.name) {
        return {
          valid: false,
          reason: "You can only reschedule to a class with the same name.",
        };
      }

      // Verify target class is not the same class
      if (targetClass.id === originalClass.id) {
        return {
          valid: false,
          reason: "You are already booked for this class.",
        };
      }

      // Verify target class hasn't started
      if (hoursUntil(targetClass.startsAt) <= 0) {
        return {
          valid: false,
          reason: "This class has already started.",
        };
      }

      // Verify target class is not cancelled
      if (targetClass.cancelled) {
        return {
          valid: false,
          reason: "This class has been cancelled.",
        };
      }

      // Check if user already has an active booking for this class
      const existingBooking = await ctx.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.classId, targetClass.id),
            eq(bookings.userId, ctx.user.id),
            sql`${bookings.status} in ('booked', 'waitlisted')`,
          ),
        )
        .get();

      if (existingBooking) {
        return {
          valid: false,
          reason: "You already have an active booking for this class.",
        };
      }

      // Check if target class is full (CORP-002, fixed — combined
      // personal + corporate occupancy, not personal bookings alone).
      const targetIsFull = await isClassFull(ctx.db, targetClass.id, targetClass.capacity);

      // Mirrors the mutation's RESCH-001 check: only a waitlisted ->
      // confirmed transition needs credits verified up front.
      const becomingConfirmed = originalBooking.status === "waitlisted" && !targetIsFull;
      if (becomingConfirmed && originalBooking.membershipId) {
        const membership = await ctx.db
          .select()
          .from(memberships)
          .where(eq(memberships.id, originalBooking.membershipId))
          .get();

        const unlimited = membership && membership.creditsRemaining >= UNLIMITED_CREDITS;
        if (membership && !unlimited && membership.creditsRemaining < targetClass.creditCost) {
          return {
            valid: false,
            reason: "Not enough class credits remaining.",
          };
        }
      }

      return {
        valid: true,
        targetIsFull,
      };
    }),
});
