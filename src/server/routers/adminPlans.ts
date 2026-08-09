import { z } from "zod";
import { eq } from "drizzle-orm";
import { membershipPlans } from "@/db/schema";
import { router, adminProcedure } from "../trpc";

/**
 * Admin Plans Router
 * 
 * WHY IT'S IMPLEMENTED:
 * Previously, the membership tiers (like "10 Classes for $100") were hardcoded
 * seeds in the database. This router allows admins to dynamically create new
 * pricing tiers and toggle their active state from the UI so members can purchase them.
 */
export const adminPlansRouter = router({
  /** Lists all membership plans (active and inactive) */
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(membershipPlans);
  }),

  /** Creates a new membership plan */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        priceCents: z.number().min(0),
        durationDays: z.number().min(1),
        classCredits: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(membershipPlans).values({
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        durationDays: input.durationDays,
        classCredits: input.classCredits,
        active: true,
      });
      return { ok: true };
    }),

  /** Toggles whether members can currently purchase this plan */
  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(membershipPlans)
        .set({ active: input.active })
        .where(eq(membershipPlans.id, input.id));
      return { ok: true };
    }),
});
