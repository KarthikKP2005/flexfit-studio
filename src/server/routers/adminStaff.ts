import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { users, trainerAvailability } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { router, adminProcedure } from "../trpc";

export const adminStaffRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(inArray(users.role, ["admin", "trainer"]));
  }),

  createTrainer: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with that email already exists.",
        });
      }

      await ctx.db.insert(users).values({
        name: input.name,
        email,
        passwordHash: hashPassword(input.password),
        role: "trainer",
        active: true,
      });

      return { ok: true };
    }),

  /**
   * Fetch a specific trainer's availability.
   * WHY IT'S IMPLEMENTED: Admins need to know when trainers are supposed to work.
   */
  getAvailability: adminProcedure
    .input(z.object({ trainerId: z.number() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(trainerAvailability)
        .where(eq(trainerAvailability.trainerId, input.trainerId));
    }),

  /**
   * Set a specific trainer's availability (overwrites previous availability).
   * WHY IT'S IMPLEMENTED: Admins need to override trainer schedules (e.g., call in sick)
   * without needing the trainer to log in and do it themselves.
   */
  setAvailability: adminProcedure
    .input(
      z.object({
        trainerId: z.number(),
        slots: z.array(
          z.object({
            dayOfWeek: z.number().min(0).max(6),
            startTime: z.string(),
            endTime: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trainer = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.trainerId))
        .get();

      if (!trainer || trainer.role !== "trainer") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not a trainer" });
      }

      // Overwrite by deleting old slots and inserting new ones
      await ctx.db
        .delete(trainerAvailability)
        .where(eq(trainerAvailability.trainerId, input.trainerId));

      if (input.slots.length > 0) {
        await ctx.db.insert(trainerAvailability).values(
          input.slots.map((s) => ({
            trainerId: input.trainerId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          }))
        );
      }

      return { ok: true };
    }),
});
