import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, sql } from "drizzle-orm";
import { users, memberships, membershipPlans, bookings, classes } from "@/db/schema";
import { router, adminProcedure } from "../trpc";

/**
 * Admin Members (CRM) Router
 * 
 * WHY IT'S IMPLEMENTED:
 * Previously, admins could only see aggregate stats for members. This router
 * gives admins full CRM capabilities: viewing all registered members, seeing their
 * individual booking histories, active memberships, and the ability to manually
 * adjust their credits to resolve disputes or offer complimentary sessions.
 */
export const adminMembersRouter = router({
  /** List all members with basic info */
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        active: users.active,
        joinedAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, "member"))
      .orderBy(desc(users.createdAt));
  }),

  /** Get full CRM profile for a specific member */
  getProfile: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .get();

      if (!member) throw new TRPCError({ code: "NOT_FOUND" });

      const memberPlans = await ctx.db
        .select({
          id: memberships.id,
          status: memberships.status,
          creditsRemaining: memberships.creditsRemaining,
          startDate: memberships.startDate,
          endDate: memberships.endDate,
          planName: membershipPlans.name,
        })
        .from(memberships)
        .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
        .where(eq(memberships.userId, input.id))
        .orderBy(desc(memberships.createdAt));

      const memberBookings = await ctx.db
        .select({
          id: bookings.id,
          status: bookings.status,
          creditsUsed: bookings.creditsUsed,
          className: classes.name,
          startsAt: classes.startsAt,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.userId, input.id))
        .orderBy(desc(classes.startsAt));

      return {
        ...member,
        memberships: memberPlans,
        bookings: memberBookings,
      };
    }),

  /** Adjust credits for a specific membership */
  adjustCredits: adminProcedure
    .input(
      z.object({
        membershipId: z.number(),
        adjustment: z.number(), // positive to add, negative to remove
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(memberships)
        .set({
          creditsRemaining: sql`${memberships.creditsRemaining} + ${input.adjustment}`,
        })
        .where(eq(memberships.id, input.membershipId));

      return { ok: true };
    }),

  /** Deactivate or Reactivate a member account */
  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ active: input.active })
        .where(eq(users.id, input.id));
      return { ok: true };
    }),
});
