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

/**
 * Moving a personal booking from one class instance to another
 * same-named one. Not responsible for: credit correctness across the
 * move (see RESCH-001/002/004 in known-issues.md — this router does not
 * charge, refund, or validate credits against what the target class
 * actually costs) or promoting the original class's waitlist after the
 * move (see RESCH-003). Target-class capacity *is* shared with
 * bookings.ts/corporate-bookings.ts (CORP-002, fixed) — both `reschedule`
 * and `validateReschedule` below now call the same `isClassFull`.
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
   * Behavior notes (see known-issues.md, not fixed here):
   * - RESCH-001/RESCH-002: the new booking's creditsUsed is copied from
   *   the original rather than recalculated, which can produce an
   *   unpaid confirmed booking (waitlisted -> confirmed) or a double
   *   charge later (confirmed -> waitlisted -> promoted).
   * - RESCH-003: never promotes anyone waitlisted for the class being
   *   left, even though this cancels a confirmed booking there.
   * - RESCH-004: doesn't validate or reconcile the target class's own
   *   creditCost against what was actually charged originally.
   *
   * @throws NOT_FOUND if the source booking or target class doesn't exist
   * @throws FORBIDDEN if the caller doesn't own the source booking
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

      // Looked up but never read below — the new booking's membershipId
      // and creditsUsed both come from `originalBooking` directly, not
      // from this query. Dead as of this reading; left in place since
      // this pass doesn't remove code, only comments it (see RESCH-001/
      // RESCH-002/RESCH-004 for the actual credit-handling issues this
      // masks).
      const membership = originalBooking.membershipId
        ? await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, originalBooking.membershipId))
            .get()
        : null;

      // Create the new booking (don't charge credits, they keep what they spent)
      const newBooking = await ctx.db
        .insert(bookings)
        .values({
          classId: targetClass.id,
          userId: ctx.user.id,
          membershipId: originalBooking.membershipId,
          status: targetIsFull ? "waitlisted" : "booked",
          creditsUsed: originalBooking.creditsUsed, // Keep the same credits used
        })
        .returning()
        .get();

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

      return {
        valid: true,
        targetIsFull,
      };
    }),
});
