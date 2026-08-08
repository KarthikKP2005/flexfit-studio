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
import { hoursUntil } from "@/lib/date";
import { validateRescheduleRules, FREE_RESCHEDULE_HOURS } from "@/services/rescheduleService";

/**
 * Moving a personal booking from one class instance to another
 * same-named one. Not responsible for: credit correctness across the
 * move (see RESCH-001/002/004 in known-issues.md — this router does not
 * charge, refund, or validate credits against what the target class
 * actually costs) or promoting the original class's waitlist after the
 * move (see RESCH-003).
 *
 * `reschedule` (mutation) and `validateReschedule` (query) intentionally
 * duplicate the same validation steps rather than sharing one function —
 * see plan.md item #53. Left as-is in this pass (a REFACTOR extracting a
 * shared `evaluateReschedule` would be reasonable follow-up work, but
 * risks behavior drift between the preview and the real mutation if not
 * done carefully with its own characterization tests).
 */

// Removed duplicate hoursUntil definition

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

      const validation = validateRescheduleRules(
        originalBooking,
        originalClass,
        targetClass,
        ctx.user.id
      );

      if (!validation.valid) {
        // We throw BAD_REQUEST or FORBIDDEN based on the reason string, 
        // or just default to BAD_REQUEST
        throw new TRPCError({
          code: validation.reason?.includes("FORBIDDEN") || validation.reason?.includes("cannot reschedule") ? "FORBIDDEN" : "BAD_REQUEST",
          message: validation.reason,
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

      // Check if target class is full
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(eq(bookings.classId, targetClass.id), eq(bookings.status, "booked")),
        );

      const targetIsFull = Number(count) >= targetClass.capacity;

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

      const targetClass = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.toClassId))
        .get();

      if (!targetClass) {
        return { valid: false, reason: "Target class not found." };
      }

      const validation = validateRescheduleRules(
        originalBooking,
        originalClass,
        targetClass,
        ctx.user.id
      );

      if (!validation.valid) {
        return validation;
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

      // Check if target class is full
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(eq(bookings.classId, targetClass.id), eq(bookings.status, "booked")),
        );

      const targetIsFull = Number(count) >= targetClass.capacity;

      return {
        valid: true,
        targetIsFull,
      };
    }),
});
