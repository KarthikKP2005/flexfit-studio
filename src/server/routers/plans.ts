import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { membershipPlans, memberships, payments } from "@/db/schema";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";

/**
 * Membership plan catalog and self-serve subscription. Not responsible
 * for: payment processing (subscribe just records a "paid" row instantly
 * — there's no real gateway). `subscribe` rejects a second subscription
 * while one `status: "active"` membership already exists (PLAN-001,
 * fixed) — it does not support renewal/extension; a member must wait for
 * their current membership to end (or have staff intervene) before
 * subscribing again.
 */

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const plansRouter = router({
  /** Active plans by default; pass includeInactive to see retired ones too. */
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(membershipPlans);
      return input.includeInactive ? rows : rows.filter((p) => p.active);
    }),

  /**
   * Creates a new active membership for the caller and an accompanying
   * "paid" payment row — there is no payment gateway, this is instant.
   *
   * Behavior notes (see known-issues.md):
   * - PLAN-002 (fixed): the membership insert and payment insert now run
   *   inside one `ctx.db.transaction`, so a failure on either side rolls
   *   both back instead of leaving an orphaned membership.
   * - PLAN-003 (fixed): payment `reference` is now `PAY-<uuid>`
   *   (crypto.randomUUID()) instead of `PAY-${Date.now()}`, so two
   *   subscriptions resolving in the same millisecond no longer produce
   *   identical references.
   *
   * @throws NOT_FOUND if planId doesn't exist
   * @throws BAD_REQUEST if the plan exists but is inactive
   * @throws CONFLICT if the caller already has an active membership
   *   (PLAN-001, fixed — subscribe no longer allows a second simultaneous
   *   active membership; renewal/extension is not supported by this
   *   procedure, see the file header comment)
   */
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

      const existingActive = await ctx.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, ctx.user.id),
            eq(memberships.status, "active"),
          ),
        )
        .get();

      if (existingActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "You already have an active membership. Wait for it to end before subscribing again.",
        });
      }

      const today = new Date().toISOString().slice(0, 10);

      // PLAN-002 fix: membership + payment must be created together or not
      // at all — without a transaction, a failure on the payment insert
      // left a membership row with no matching payment record.
      const membership = await ctx.db.transaction(async (tx) => {
        const created = await tx
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

        await tx.insert(payments).values({
          userId: ctx.user.id,
          membershipId: created.id,
          amountCents: plan.priceCents,
          method: input.method,
          status: "paid",
          // PLAN-003 fix: was `PAY-${Date.now()}`, which collided when two
          // subscriptions resolved in the same millisecond.
          reference: `PAY-${crypto.randomUUID()}`,
        });

        return created;
      });

      return membership;
    }),

  /** Adds a new plan to the catalog, active by default. */
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

  /**
   * Toggles a plan's active flag.
   *
   * Behavior note (FIX: PLAN-004):
   * Now throws NOT_FOUND if the plan id doesn't match any row, consistent
   * with other mutations.
   *
   * @throws NOT_FOUND if the plan doesn't exist
   */
  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(membershipPlans)
        .set({ active: input.active })
        .where(eq(membershipPlans.id, input.id))
        .returning()
        .get();
        
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found." });
      }
      
      return updated;
    }),
});
