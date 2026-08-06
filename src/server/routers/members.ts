import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { users, memberships, membershipPlans, bookings } from "@/db/schema";
import { router, protectedProcedure, staffProcedure, adminProcedure } from "../trpc";

export const membersRouter = router({
  // Fix #18/#19: Use the same membership filter as activeMembershipFor() in
  // bookings.ts so dashboard and booking-eligibility always agree.
  profile: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10);
    const membership = await ctx.db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        creditsRemaining: memberships.creditsRemaining,
        planName: membershipPlans.name,
        planCredits: membershipPlans.classCredits,
      })
      .from(memberships)
      .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(
        and(
          eq(memberships.userId, ctx.user.id),
          eq(memberships.status, "active"),
          sql`${memberships.endDate} >= ${today}`,
          sql`${memberships.startDate} <= ${today}`,
        ),
      )
      .orderBy(desc(memberships.endDate))
      .get();

    const [{ attended }] = await ctx.db
      .select({ attended: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(eq(bookings.userId, ctx.user.id), eq(bookings.status, "attended")),
      );

    const { companies, companyMembers } = await import("@/db/schema");
    const companyRow = await ctx.db
      .select({ id: companies.id, name: companies.name })
      .from(companyMembers)
      .innerJoin(companies, eq(companyMembers.companyId, companies.id))
      .where(
        and(
          eq(companyMembers.userId, ctx.user.id),
          eq(companies.active, true),
        ),
      )
      .get();

    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
      membership: membership ?? null,
      company: companyRow ?? null,
      classesAttended: Number(attended),
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.user.id))
        .returning()
        .get();
    }),

  search: staffProcedure
    .input(z.object({ q: z.string().default(""), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const term = `%${input.q.trim()}%`;
      return ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .where(
          input.q.trim()
            ? or(like(users.name, term), like(users.email, term))
            : undefined,
        )
        .limit(input.limit);
    }),

  byId: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      const history = await ctx.db
        .select({
          id: memberships.id,
          planName: membershipPlans.name,
          startDate: memberships.startDate,
          endDate: memberships.endDate,
          status: memberships.status,
          creditsRemaining: memberships.creditsRemaining,
        })
        .from(memberships)
        .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
        .where(eq(memberships.userId, user.id))
        .orderBy(desc(memberships.startDate));

      const { passwordHash: _omit, ...safe } = user;
      return { ...safe, memberships: history };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set({ active: input.active })
        .where(eq(users.id, input.id))
        .returning()
        .get();
    }),

  setRole: adminProcedure
    .input(z.object({ id: z.number(), role: z.enum(["member", "trainer", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.id))
        .returning()
        .get();
    }),

  lookupByEmailOrPhone: staffProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const term = `%${input.query.trim()}%`;
      const user = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .where(
          or(
            like(users.email, term),
            like(users.phone, term),
          ),
        )
        .get();

      if (!user || user.role !== "member") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      return user;
    }),
});
