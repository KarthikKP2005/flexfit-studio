import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { classes, users } from "@/db/schema";
import { router, adminProcedure } from "../trpc";
import { isTrainerAvailable } from "@/features/trainers/availability-service";

/**
 * Admin Classes Router
 * 
 * WHY IT'S IMPLEMENTED:
 * Previously, the class schedule was entirely hardcoded via database seeds. 
 * This router gives admins the essential ability to dynamically create new classes,
 * set their capacities and credit costs, and assign trainers from the UI.
 * It also allows admins to cancel classes and easily swap trainers for a scheduled class
 * (e.g., if a trainer calls in sick).
 */
export const adminClassesRouter = router({
  /** Lists all classes along with their assigned trainer. */
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        room: classes.room,
        capacity: classes.capacity,
        startsAt: classes.startsAt,
        durationMin: classes.durationMin,
        creditCost: classes.creditCost,
        cancelled: classes.cancelled,
        trainerId: classes.trainerId,
        trainerName: users.name,
      })
      .from(classes)
      .leftJoin(users, eq(classes.trainerId, users.id))
      .orderBy(desc(classes.startsAt));
  }),

  /** Creates a new class on the schedule. */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        trainerId: z.number(),
        room: z.string().min(1),
        capacity: z.number().min(1),
        startsAt: z.string(), // ISO string
        durationMin: z.number().min(1),
        creditCost: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that the assigned trainer is actually a trainer
      const trainer = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.trainerId))
        .get();

      if (!trainer || trainer.role !== "trainer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected user is not a valid trainer.",
        });
      }

      const check = await isTrainerAvailable(ctx.db, input.trainerId, input.startsAt, input.durationMin);
      if (!check.available) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.reason });
      }

      await ctx.db.insert(classes).values({
        name: input.name,
        description: input.description,
        trainerId: input.trainerId,
        room: input.room,
        capacity: input.capacity,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        creditCost: input.creditCost,
        cancelled: false,
      });

      return { ok: true };
    }),

  /** Cancels a class (prevents further bookings). */
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Note: A full implementation would also loop through existing `bookings` 
      // for this class, refund credits, and send notifications.
      await ctx.db
        .update(classes)
        .set({ cancelled: true })
        .where(eq(classes.id, input.id));

      return { ok: true };
    }),

  /** 
   * Trainer Availability Override Feature:
   * Swaps the assigned trainer for a specific scheduled class.
   * WHY IT'S IMPLEMENTED: Admins need the flexibility to override normal schedules 
   * if a trainer calls in sick or is unavailable for a specific instance.
   */
  swapTrainer: adminProcedure
    .input(z.object({ classId: z.number(), newTrainerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const trainer = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.newTrainerId))
        .get();

      if (!trainer || trainer.role !== "trainer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected user is not a valid trainer.",
        });
      }

      await ctx.db
        .update(classes)
        .set({ trainerId: input.newTrainerId })
        .where(eq(classes.id, input.classId));

      return { ok: true };
    }),
});
