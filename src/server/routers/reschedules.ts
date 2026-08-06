import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  reschedules,
  bookings,
  classes,
  memberships,
  corporateBookings,
} from "@/db/schema";
import { router, protectedProcedure } from "../trpc";
import { activeMembershipFor, UNLIMITED_CREDITS, promoteNextWaitlisted } from "./bookings";

/**
 * Members may reschedule free of charge up to this many hours before the
 * original class starts. This is more generous than cancellation policy.
 */
export const FREE_RESCHEDULE_HOURS = 4;

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

// ---------------------------------------------------------------------------
// Fix #6: Unified capacity check — counts BOTH normal + corporate bookings.
// ---------------------------------------------------------------------------
async function totalBookedCount(
  db: typeof import("@/db").db,
  classId: number,
): Promise<number> {
  const [{ normalCount }] = await db
    .select({ normalCount: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));

  const [{ corpCount }] = await db
    .select({ corpCount: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "booked"),
      ),
    );

  return Number(normalCount) + Number(corpCount);
}

export const reschedulesRouter = router({
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

      // Fix #5: Verify target class is not the same class (by ID, not time)
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

      // Fix #6: Unified capacity check
      const count = await totalBookedCount(ctx.db, targetClass.id);
      const targetIsFull = count >= targetClass.capacity;

      // Get the membership
      const membership = originalBooking.membershipId
        ? await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, originalBooking.membershipId))
            .get()
        : null;

      const unlimited = membership
        ? membership.creditsRemaining >= UNLIMITED_CREDITS
        : false;

      // ---------------------------------------------------------------------------
      // Fix #10: Waitlisted reschedule → don't create a free confirmed booking.
      // Fix #11: Don't carry credits into waitlisted booking (prevents double-charge).
      // Fix #13: Use target class's creditCost, not original's creditsUsed.
      //
      // The logic:
      //   1) Refund the original booking's credits (if any were spent)
      //   2) If target has space → charge target's creditCost
      //   3) If target is full → waitlist with creditsUsed: 0 (charged on promotion)
      // ---------------------------------------------------------------------------

      // Step 1: Refund original credits
      if (originalBooking.creditsUsed > 0 && membership && !unlimited) {
        await ctx.db
          .update(memberships)
          .set({
            creditsRemaining: membership.creditsRemaining + originalBooking.creditsUsed,
          })
          .where(eq(memberships.id, membership.id));
      }

      // Reload membership after refund for accurate credit check
      const updatedMembership = membership
        ? await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, membership.id))
            .get()
        : null;

      // Step 2: Determine new credit cost
      let newCreditsUsed = 0;
      if (!targetIsFull) {
        // Fix #13: use TARGET class credit cost, not original
        newCreditsUsed = targetClass.creditCost;

        // Check if member can afford it
        if (updatedMembership && !unlimited) {
          if (updatedMembership.creditsRemaining < targetClass.creditCost) {
            // Can't afford — undo refund and throw
            if (originalBooking.creditsUsed > 0 && membership) {
              await ctx.db
                .update(memberships)
                .set({ creditsRemaining: membership.creditsRemaining })
                .where(eq(memberships.id, membership.id));
            }
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Not enough credits for the target class.",
            });
          }
        }
      }
      // If targetIsFull, newCreditsUsed stays 0 (Fix #11: no pre-charge for waitlist)

      // Step 3: Create new booking
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

      // Deduct credits for the new booking if confirmed
      if (!targetIsFull && newCreditsUsed > 0 && updatedMembership && !unlimited) {
        await ctx.db
          .update(memberships)
          .set({
            creditsRemaining: updatedMembership.creditsRemaining - newCreditsUsed,
          })
          .where(eq(memberships.id, updatedMembership.id));
      }

      // Cancel the original booking
      await ctx.db
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        })
        .where(eq(bookings.id, originalBooking.id));

      // Fix #12: Promote the old class's waitlist after freeing a seat
      if (originalBooking.status === "booked") {
        await promoteNextWaitlisted(ctx.db, originalClass.id, originalClass);
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

  // Fix #5: Now accepts fromClassId so the client can properly exclude it
  validateReschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
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

      if (originalBooking.userId !== ctx.user.id) {
        return { valid: false, reason: "You cannot reschedule this booking." };
      }

      if (
        originalBooking.status !== "booked" &&
        originalBooking.status !== "waitlisted"
      ) {
        return {
          valid: false,
          reason: "This booking is no longer active.",
        };
      }

      const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
      if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
        return {
          valid: false,
          reason: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
        };
      }

      const targetClass = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.toClassId))
        .get();

      if (!targetClass) {
        return { valid: false, reason: "Target class not found." };
      }

      if (targetClass.name !== originalClass.name) {
        return {
          valid: false,
          reason: "You can only reschedule to a class with the same name.",
        };
      }

      if (targetClass.id === originalClass.id) {
        return {
          valid: false,
          reason: "You are already booked for this class.",
        };
      }

      if (hoursUntil(targetClass.startsAt) <= 0) {
        return {
          valid: false,
          reason: "This class has already started.",
        };
      }

      if (targetClass.cancelled) {
        return {
          valid: false,
          reason: "This class has been cancelled.",
        };
      }

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

      // Fix #6: Unified capacity
      const count = await totalBookedCount(ctx.db, targetClass.id);
      const targetIsFull = count >= targetClass.capacity;

      return {
        valid: true,
        targetIsFull,
      };
    }),
});
