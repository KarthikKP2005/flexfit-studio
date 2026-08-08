import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
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
 * subscribing again. The membership + payment insert is atomic
 * (PLAN-002, fixed) and the payment `reference` is collision-resistant
 * (PLAN-003, fixed) — see `subscribe`'s own comment for both.
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
   * Behavior notes:
   * - PLAN-002, fixed: the membership insert and payment insert now run
   *   inside one `ctx.db.transaction`, so a failure between them can no
   *   longer leave an orphaned membership with no payment record. The
   *   `existingActive` check (PLAN-001) stays outside the transaction —
   *   it's a read, not a write, and matches the check-then-insert shape
   *   every other duplicate-guard in this codebase already uses.
   * - PLAN-003, fixed: payment `reference` is now `PAY-<uuid>`
   *   (`crypto.randomUUID()`) instead of `PAY-${Date.now()}`, so two
   *   subscriptions in the same millisecond can no longer collide. No
   *   database-level unique constraint was added — `reference` is
   *   informational only (displayed in `payments.mine`/`payments.all`,
   *   never queried by value anywhere in this codebase), so plan.md's
   *   own conditional ("add a unique constraint if references are
   *   business identifiers") doesn't apply here; adding one would be an
   *   unforced schema change per Rule 1.2.
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

      return ctx.db.transaction(async (tx) => {
        const membership = await tx
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
          membershipId: membership.id,
          amountCents: plan.priceCents,
          method: input.method,
          status: "paid",
          reference: `PAY-${randomUUID()}`,
        });

        return membership;
      });
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
   * Behavior note (see PLAN-004 in known-issues.md — not fixed here):
   * if `id` doesn't match any plan, this silently returns undefined
   * instead of throwing NOT_FOUND like most other update procedures do.
   */
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
