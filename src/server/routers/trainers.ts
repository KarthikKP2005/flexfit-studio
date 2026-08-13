import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, sql } from "drizzle-orm";
import { classes, users, trainerAvailability, bookings } from "@/db/schema";
import { router, staffProcedure } from "../trpc";
import { isTrainerAvailable } from "@/features/trainers/availability-service";

/**
 * Trainer self-service: own upcoming classes, weekly availability CRUD,
 * and an availability/conflict check used for scheduling. Every
 * procedure role-checks manually (not staffProcedure) since "trainer" is
 * the specific role required, not "trainer or admin" — except
 * checkAvailability, which staff and trainers can both call.
 */

export const trainersRouter = router({
  /** This trainer's own future, non-cancelled classes. @throws FORBIDDEN if the caller isn't a trainer */
  upcomingClasses: staffProcedure.query(async ({ ctx }) => {
    const now = new Date().toISOString();

    const rows = await ctx.db
      .select({
        id: classes.id,
        name: classes.name,
        room: classes.room,
        startsAt: classes.startsAt,
        durationMin: classes.durationMin,
        cancelled: classes.cancelled,
        capacity: classes.capacity,
        booked: sql<number>`(
          select count(*) from ${bookings}
          where ${bookings.classId} = ${classes.id}
            and ${bookings.status} = 'booked'
        )`.as("booked"),
      })
      .from(classes)
      .where(
        and(
          eq(classes.trainerId, ctx.user.id),
          gte(classes.startsAt, now),
          eq(classes.cancelled, false),
        ),
      )
      .orderBy(classes.startsAt);

    return rows.map((r) => ({
      ...r,
      spotsLeft: Math.max(0, r.capacity - Number(r.booked)),
    }));
  }),

  /** This trainer's own weekly availability rows. @throws FORBIDDEN if the caller isn't a trainer */
  availability: staffProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(trainerAvailability)
      .where(eq(trainerAvailability.trainerId, ctx.user.id))
      .orderBy(trainerAvailability.dayOfWeek);

    return rows;
  }),

  /**
   * Upserts this trainer's availability for one day of week — updates
   * the existing row for that day if one exists, otherwise inserts.
   *
   * Behavior note (see TRAINER-001 in known-issues.md — not fixed here):
   * startTime/endTime accept any string, not just HH:mm, and there's no
   * check that startTime is before endTime.
   *
   * @throws FORBIDDEN if the caller isn't a trainer
   */
  setAvailability: staffProcedure
    .input(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // WHY IT'S IMPLEMENTED: Validation ensuring trainers cannot set an invalid time block.
      if (input.startTime >= input.endTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start time must be before end time.",
        });
      }

      const existing = await ctx.db
        .select()
        .from(trainerAvailability)
        .where(
          and(
            eq(trainerAvailability.trainerId, ctx.user.id),
            eq(trainerAvailability.dayOfWeek, input.dayOfWeek),
          ),
        )
        .get();

      if (existing) {
        return ctx.db
          .update(trainerAvailability)
          .set({
            startTime: input.startTime,
            endTime: input.endTime,
          })
          .where(eq(trainerAvailability.id, existing.id))
          .returning()
          .get();
      } else {
        return ctx.db
          .insert(trainerAvailability)
          .values({
            trainerId: ctx.user.id,
            dayOfWeek: input.dayOfWeek,
            startTime: input.startTime,
            endTime: input.endTime,
          })
          .returning()
          .get();
      }
    }),

  /**
   * Removes this trainer's availability row for one day of week, if one
   * exists. Always returns { success: true }, even if there was nothing
   * to remove.
   *
   * @throws FORBIDDEN if the caller isn't a trainer
   */
  removeAvailability: staffProcedure
    .input(z.object({ dayOfWeek: z.number().int().min(0).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(trainerAvailability)
        .where(
          and(
            eq(trainerAvailability.trainerId, ctx.user.id),
            eq(trainerAvailability.dayOfWeek, input.dayOfWeek),
          ),
        )
        .get();

      if (existing) {
        await ctx.db
          .delete(trainerAvailability)
          .where(eq(trainerAvailability.id, existing.id));
      }

      return { success: true };
    }),

  /**
   * Checks whether `trainerId` is free at `startsAt` for `durationMin`:
   * has an availability row for that day, the requested window falls
   * inside it, and it doesn't overlap an existing non-cancelled class of
   * theirs. This procedure exists but is never invoked from
   * classes.ts's create/update — nothing currently stops staff from
   * scheduling a class that this check would flag.
   *
   * Behavior note (see TRAINER-002 in known-issues.md — not fixed here):
   * day-of-week and clock time are derived via getUTCDay()/getUTCHours(),
   * i.e. availability rows are implicitly in UTC, not a trainer's local
   * time.
   *
   * @throws FORBIDDEN if the caller is neither a trainer nor an admin
   */
  checkAvailability: staffProcedure
    .input(
      z.object({
        trainerId: z.number(),
        startsAt: z.string(),
        durationMin: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return isTrainerAvailable(ctx.db, input.trainerId, input.startsAt, input.durationMin);
    }),
});
