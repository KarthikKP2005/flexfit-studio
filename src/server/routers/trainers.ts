import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  classes,
  users,
  trainerAvailability,
  bookings,
  corporateBookings,
  checkins,
} from "@/db/schema";
import { router, protectedProcedure, staffProcedure } from "../trpc";

/**
 * Checks whether a trainer is available for a proposed class time slot.
 *
 * This function is the single source of truth for trainer scheduling
 * conflicts. It is called from:
 *   1. `classes.create` — blocks class creation if trainer unavailable
 *   2. `classes.update` — blocks time/trainer changes if unavailable
 *   3. `trainers.checkAvailability` — exposes the check as a tRPC query
 *      for UI pre-validation
 *
 * WHY this exists (TRAINER-03): Before this fix, the function existed in the
 * codebase but was never actually called from anywhere. Class creation and
 * updates could freely schedule a trainer during their off-hours or double-
 * book them. Now it is wired into classes.create and classes.update as a
 * mandatory server-side gate.
 *
 * The function performs two checks:
 *   a) Does the trainer have an availability record for this day of the week,
 *      and does the proposed time fall within that window?
 *   b) Does the trainer already have another (non-cancelled) class that
 *      overlaps with the proposed time range?
 *
 * IMPORTANT (TRAINER-06): Uses LOCAL time (getDay/getHours) not UTC
 * (getUTCDay/getUTCHours) — see fix/trainer-06 for the timezone rationale.
 *
 * Defect: TRAINER-03 ("checkAvailability exists but is never called")
 * Source: finallist_phase1.docx — Trainer Problem #3
 *
 * @param db       — Drizzle database instance
 * @param trainerId — the trainer's user ID
 * @param startsAt  — ISO-8601 string of the proposed class start time
 * @param durationMin — class duration in minutes
 * @param excludeClassId — optional class ID to exclude from overlap check
 *                         (used during class updates so the class doesn't
 *                         conflict with itself)
 * @returns { available: true } or { available: false, reason: string }
 */
export async function checkTrainerAvailability(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]["ctx"]["db"],
  trainerId: number,
  startsAt: string,
  durationMin: number,
  excludeClassId?: number,
): Promise<{ available: boolean; reason?: string }> {
  // Use LOCAL time (not UTC) so the day/hour matches what the trainer sees in
  // the browser. Bug #6 was using getUTCDay()/getUTCHours() here.
  const classStart = new Date(startsAt);
  const classEnd = new Date(classStart.getTime() + durationMin * 60000);

  const dayOfWeek = classStart.getDay(); // LOCAL day-of-week (0=Sun…6=Sat)
  const startTimeStr =
    String(classStart.getHours()).padStart(2, "0") +
    ":" +
    String(classStart.getMinutes()).padStart(2, "0");
  const endTimeStr =
    String(classEnd.getHours()).padStart(2, "0") +
    ":" +
    String(classEnd.getMinutes()).padStart(2, "0");

  const availability = await db
    .select()
    .from(trainerAvailability)
    .where(
      and(
        eq(trainerAvailability.trainerId, trainerId),
        eq(trainerAvailability.dayOfWeek, dayOfWeek),
      ),
    )
    .get();

  if (!availability) {
    return { available: false, reason: "No availability set for this day" };
  }

  const isWithinAvailability =
    startTimeStr >= availability.startTime && endTimeStr <= availability.endTime;

  if (!isWithinAvailability) {
    return {
      available: false,
      reason: `Class time ${startTimeStr}–${endTimeStr} falls outside trainer's availability ${availability.startTime}–${availability.endTime}`,
    };
  }

  // Check for conflicting classes (skip excludeClassId for update use-case)
  const conflictingClasses = await db
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.trainerId, trainerId),
        eq(classes.cancelled, false),
      ),
    );

  // Walk every non-cancelled class this trainer is assigned to and check for
  // time-range overlap with the proposed slot. If excludeClassId is set (i.e.
  // we are updating an existing class), skip that class so it doesn't falsely
  // conflict with itself.
  for (const cls of conflictingClasses) {
    if (excludeClassId && cls.id === excludeClassId) continue;
    const existStart = new Date(cls.startsAt);
    const existEnd = new Date(existStart.getTime() + cls.durationMin * 60000);

    if (classStart < existEnd && classEnd > existStart) {
      return {
        available: false,
        reason: "Trainer already has a class at this time",
      };
    }
  }

  return { available: true };
}

export const trainersRouter = router({
  // -------------------------------------------------------------------------
  // Upcoming classes for the logged-in trainer.
  // Fix #4/#9: now includes total booked count (normal + corporate combined).
  // -------------------------------------------------------------------------
  upcomingClasses: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "trainer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only trainers can access this.",
      });
    }

    const now = new Date().toISOString();

    const rows = await ctx.db
      .select({
        id: classes.id,
        name: classes.name,
        room: classes.room,
        startsAt: classes.startsAt,
        durationMin: classes.durationMin,
        capacity: classes.capacity,
        cancelled: classes.cancelled,
        // Count of normal confirmed/attended bookings
        normalBookedCount: sql<number>`(
          select count(*) from ${bookings}
          where ${bookings.classId} = ${classes.id}
            and (${bookings.status} = 'booked' or ${bookings.status} = 'attended')
        )`.as("normal_booked_count"),
        // Count of corporate confirmed/attended bookings
        corporateBookedCount: sql<number>`(
          select count(*) from ${corporateBookings}
          where ${corporateBookings.classId} = ${classes.id}
            and (${corporateBookings.status} = 'booked' or ${corporateBookings.status} = 'attended')
        )`.as("corporate_booked_count"),
        // Total check-ins (normal only — corporate check-ins link to normal bookings)
        checkinCount: sql<number>`(
          select count(*) from ${checkins}
          inner join ${bookings} on ${checkins.bookingId} = ${bookings.id}
          where ${bookings.classId} = ${classes.id}
        )`.as("checkin_count"),
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
      totalBookedCount: Number(r.normalBookedCount) + Number(r.corporateBookedCount),
      normalBookedCount: Number(r.normalBookedCount),
      corporateBookedCount: Number(r.corporateBookedCount),
      checkinCount: Number(r.checkinCount),
    }));
  }),

  // -------------------------------------------------------------------------
  // Named roster for a class — normal + corporate bookings combined.
  // Fix #2: trainer can now see who is booked, not just counts.
  // -------------------------------------------------------------------------
  rosterWithCorporate: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Fetch normal bookings with member names
      const normalBookings = await ctx.db
        .select({
          id: bookings.id,
          status: bookings.status,
          bookedAt: bookings.bookedAt,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          source: sql<"normal">`'normal'`.as("source"),
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(eq(bookings.classId, input.classId));

      // Fetch corporate bookings with member names
      const corpBookings = await ctx.db
        .select({
          id: corporateBookings.id,
          status: corporateBookings.status,
          bookedAt: corporateBookings.bookedAt,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          source: sql<"corporate">`'corporate'`.as("source"),
        })
        .from(corporateBookings)
        .innerJoin(users, eq(corporateBookings.userId, users.id))
        .where(eq(corporateBookings.classId, input.classId));

      // Combine and sort by bookedAt
      const combined = [
        ...normalBookings.map((b) => ({ ...b, source: "normal" as const })),
        ...corpBookings.map((b) => ({ ...b, source: "corporate" as const })),
      ].sort((a, b) => a.bookedAt.localeCompare(b.bookedAt));

      return combined;
    }),

  // -------------------------------------------------------------------------
  // Weekly availability CRUD (unchanged logic, just re-exported)
  // -------------------------------------------------------------------------
  availability: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "trainer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only trainers can access this.",
      });
    }

    const rows = await ctx.db
      .select()
      .from(trainerAvailability)
      .where(eq(trainerAvailability.trainerId, ctx.user.id))
      .orderBy(trainerAvailability.dayOfWeek);

    return rows;
  }),

  setAvailability: protectedProcedure
    .input(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "trainer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only trainers can access this.",
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

  removeAvailability: protectedProcedure
    .input(z.object({ dayOfWeek: z.number().int().min(0).max(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "trainer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only trainers can access this.",
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
        await ctx.db
          .delete(trainerAvailability)
          .where(eq(trainerAvailability.id, existing.id));
      }

      return { success: true };
    }),

  /**
   * Public tRPC query exposing checkTrainerAvailability() for UI pre-validation.
   *
   * WHY (TRAINER-03): Before this fix, the availability-checking logic existed
   * but was only a dead-code helper. This procedure exposes it so the admin
   * class-scheduling UI can show live feedback ("trainer available" / "conflict")
   * before the form is submitted. The actual enforcement happens server-side
   * in `classes.create` and `classes.update` — this query is a convenience
   * preview, not a security gate.
   *
   * Defect: TRAINER-03 ("checkAvailability exists but is never called")
   * Also relates to: TRAINER-06 (UTC fix), TRAINER-10 (timezone centralization)
   * Source: finallist_phase1.docx — Trainer Problems #3, #6, #10
   *
   * @param trainerId — the trainer to check
   * @param startsAt — proposed class start (ISO-8601)
   * @param durationMin — class duration in minutes
   * @param excludeClassId — optional, skip this class from overlap check
   * @returns { available: boolean, reason?: string }
   * @throws FORBIDDEN if caller is not a trainer or admin
   */
  checkAvailability: protectedProcedure
    .input(
      z.object({
        trainerId: z.number(),
        startsAt: z.string(),
        durationMin: z.number(),
        excludeClassId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Role gate: only trainers and admins may check trainer availability
      if (ctx.user.role !== "trainer" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Staff only.",
        });
      }
      return checkTrainerAvailability(
        ctx.db,
        input.trainerId,
        input.startsAt,
        input.durationMin,
        input.excludeClassId,
      );
    }),
});
