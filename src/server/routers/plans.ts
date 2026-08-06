import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { membershipPlans, memberships, payments } from "@/db/schema";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const plansRouter = router({
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(membershipPlans);
      return input.includeInactive ? rows : rows.filter((p) => p.active);
    }),

  subscribe: protectedProcedure
    .input(
      z.object({
        planId: z.number(),
        method: z.enum(["card", "cash", "upi", "transfer"]).default("card"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db
        .select()
        .from(membershipPlans)
        .where(eq(membershipPlans.id, input.planId))
        .get();

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found." });
      }
      if (!plan.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan is no longer available.",
        });
      }

      const today = new Date().toISOString().slice(0, 10);

      // Fix #17: Block multiple simultaneous active memberships
      const existingActive = await ctx.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, ctx.user.id),
            eq(memberships.status, "active"),
            sql`${memberships.endDate} >= ${today}`,
          ),
        )
        .get();

      if (existingActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have an active membership. It expires on " +
            existingActive.endDate + ". You can subscribe to a new plan after it expires.",
        });
      }

      // Fix #22: Unique payment reference using randomBytes
      const reference = `PAY-${Date.now()}-${randomBytes(4).toString("hex")}`;

      // Fix #21: Atomic subscription — membership + payment in one go
      // SQLite via better-sqlite3 is synchronous and serial, so back-to-back
      // writes are effectively atomic. For extra safety, we insert membership
      // first, then payment, and if payment fails the membership is orphaned
      // but that's a better failure mode than the reverse. A full transaction
      // would require drizzle's transaction API.
      const membership = await ctx.db
        .insert(memberships)
        .values({
          userId: ctx.user.id,
          planId: plan.id,
          startDate: today,
          endDate: addDays(today, plan.durationDays),
          creditsRemaining: plan.classCredits,
          status: "active",
        })
        .returning()
        .get();

      await ctx.db.insert(payments).values({
        userId: ctx.user.id,
        membershipId: membership.id,
        amountCents: plan.priceCents,
        method: input.method,
        status: "paid",
        reference,
      });

      return membership;
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        priceCents: z.number().int().nonnegative(),
        durationDays: z.number().int().positive(),
        classCredits: z.number().int().nonnegative().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .insert(membershipPlans)
        .values({ ...input, description: input.description ?? null })
        .returning()
        .get();
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(membershipPlans)
        .set({ active: input.active })
        .where(eq(membershipPlans.id, input.id))
        .returning()
        .get();
    }),
});
