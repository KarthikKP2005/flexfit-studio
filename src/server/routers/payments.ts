import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { payments, users, memberships, membershipPlans, bookings, classes, notifications } from "@/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc";

/**
 * Payment records: a member's own history, the admin-facing full list,
 * and admin mark-paid/refund actions. Not responsible for: actually
 * processing a payment (there's no gateway — plans.ts's subscribe
 * inserts a "paid" row directly) or reconciling bookings/credits when a
 * payment is refunded (see PAY-001 in known-issues.md).
 */

export const paymentsRouter = router({
  /** The caller's own payments, newest first, with the plan name joined in. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        method: payments.method,
        status: payments.status,
        reference: payments.reference,
        createdAt: payments.createdAt,
        planName: membershipPlans.name,
      })
      .from(payments)
      .leftJoin(memberships, eq(payments.membershipId, memberships.id))
      .leftJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(eq(payments.userId, ctx.user.id))
      .orderBy(desc(payments.createdAt));
  }),

  /** All payments across all users, newest first, capped at `limit` (default 100). */
  all: adminProcedure
    .input(z.object({ limit: z.number().default(100) }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: payments.id,
          amountCents: payments.amountCents,
          method: payments.method,
          status: payments.status,
          reference: payments.reference,
          createdAt: payments.createdAt,
          memberName: users.name,
          memberEmail: users.email,
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .orderBy(desc(payments.createdAt))
        .limit(input.limit);
    }),

  /**
   * Sets a payment's status to "paid". Only blocks the "refunded" case —
   * a "pending" or even a "failed" payment can be marked paid directly,
   * consistent with there being no real payment gateway to fail against.
   *
   * @throws NOT_FOUND if the payment doesn't exist
   * @throws BAD_REQUEST if the payment is currently "refunded"
   */
  markPaid: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select()
        .from(payments)
        .where(eq(payments.id, input.id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
      }
      if (row.status === "refunded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refunded payments cannot be marked paid.",
        });
      }

      return ctx.db
        .update(payments)
        .set({ status: "paid" })
        .where(eq(payments.id, input.id))
        .returning()
        .get();
    }),

  /**
   * Sets a payment's status to "refunded" and, if it's linked to a
   * membership, cancels that membership.
   *
   * Behavior note (see PAY-001 in known-issues.md — not fixed here):
   * does not touch any bookings already made against the cancelled
   * membership, and does not adjust its remaining credits — a member
   * keeps classes they were refunded for.
   *
   * @throws NOT_FOUND if the payment doesn't exist
   * @throws BAD_REQUEST if the payment isn't currently "paid"
   */
  refund: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const row = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, input.id))
          .get();

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
        }
        if (row.status !== "paid") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only paid payments can be refunded.",
          });
        }

        const updated = await tx
          .update(payments)
          .set({ status: "refunded" })
          .where(eq(payments.id, input.id))
          .returning()
          .get();

        if (row.membershipId) {
          await tx
            .update(memberships)
            .set({ status: "cancelled", creditsRemaining: 0 })
            .where(eq(memberships.id, row.membershipId));

          const futureBookings = await tx
            .select({
              id: bookings.id,
              status: bookings.status,
              className: classes.name,
              startsAt: classes.startsAt,
            })
            .from(bookings)
            .innerJoin(classes, eq(bookings.classId, classes.id))
            .where(
              and(
                eq(bookings.membershipId, row.membershipId),
                or(eq(bookings.status, "booked"), eq(bookings.status, "waitlisted")),
                gte(classes.startsAt, new Date().toISOString())
              )
            );

          for (const b of futureBookings) {
            await tx
              .update(bookings)
              .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
              .where(eq(bookings.id, b.id));

            await tx.insert(notifications).values({
              userId: row.userId,
              type: "booking_cancelled",
              title: "Booking Cancelled",
              message: `Your booking for ${b.className} on ${new Date(b.startsAt).toLocaleString()} was cancelled due to a payment refund.`,
            });
          }
        }

        return updated;
      });
    }),
});
