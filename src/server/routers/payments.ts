import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { payments, users, memberships, membershipPlans, bookings, classes } from "@/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { promoteNextWaitlisted } from "@/features/bookings/waitlist-service";

/**
 * Payment records: a member's own history, the admin-facing full list,
 * and admin mark-paid/refund actions. Not responsible for: actually
 * processing a payment (there's no gateway — plans.ts's subscribe
 * inserts a "paid" row directly). `refund` reconciles bookings made
 * against the cancelled membership (PAY-001, fixed) via the shared
 * `promoteNextWaitlisted` in src/features/bookings/ — this file does not
 * duplicate that promotion logic.
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
   * Sets a payment's status to "refunded", cancels the linked membership
   * (if any), and cancels every booking still `booked` or `waitlisted`
   * against that membership (PAY-001, fixed — chosen policy, see Rule 8:
   * a refund revokes what was paid for, so a member keeps classes
   * they've already attended but not ones they haven't gone to yet).
   *
   * Behavior notes:
   * - Membership `creditsRemaining` is left untouched — moot once the
   *   membership is `cancelled`, since `getCurrentMembership` (MEMBER-002/
   *   MEMBER-006, fixed) never selects a cancelled membership again
   *   regardless of its credit balance.
   * - Each cancelled `booked` (confirmed) row frees a seat, so it
   *   promotes the next eligible waitlisted candidate for that class —
   *   the same shared `promoteNextWaitlisted` a normal `bookings.cancel`
   *   uses, run once per freed seat, not batched.
   * - Corporate bookings are untouched — `payments.membershipId` only
   *   ever links to a personal `memberships` row, never a company's
   *   credit pool, so there is nothing corporate for a membership refund
   *   to reconcile.
   *
   * @throws NOT_FOUND if the payment doesn't exist
   * @throws BAD_REQUEST if the payment isn't currently "paid"
   */
  refund: adminProcedure
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
      if (row.status !== "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only paid payments can be refunded.",
        });
      }

      const updated = await ctx.db
        .update(payments)
        .set({ status: "refunded" })
        .where(eq(payments.id, input.id))
        .returning()
        .get();

      if (row.membershipId) {
        await ctx.db
          .update(memberships)
          .set({ status: "cancelled" })
          .where(eq(memberships.id, row.membershipId));

        const dependentBookings = await ctx.db
          .select({ booking: bookings, cls: classes })
          .from(bookings)
          .innerJoin(classes, eq(bookings.classId, classes.id))
          .where(
            and(
              eq(bookings.membershipId, row.membershipId),
              inArray(bookings.status, ["booked", "waitlisted"]),
            ),
          );

        // Cancel every still-active booking under the refunded
        // membership, oldest first; a confirmed one being cancelled
        // frees a seat, so it promotes whoever's next on that class's
        // waitlist (same shared logic bookings.cancel uses).
        for (const dep of dependentBookings) {
          await ctx.db
            .update(bookings)
            .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
            .where(eq(bookings.id, dep.booking.id));

          if (dep.booking.status === "booked") {
            await promoteNextWaitlisted(ctx.db, dep.cls);
          }
        }
      }

      return updated;
    }),
});
