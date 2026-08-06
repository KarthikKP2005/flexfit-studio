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

// ---------------------------------------------------------------------------
// Internal helper: check if a class time falls within a trainer's stated
// availability, using LOCAL time (not UTC) so the check matches the UI.
// Returns { available: true } or { available: false, reason: string }
// ---------------------------------------------------------------------------
export async function checkTrainerAvailability(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]["ctx"]["db"],
  trainerId: number,
  startsAt: string,
  durationMin: number,
  excludeClassId?: number,
): Promise<{ available: boolean; reason?: string }> {
  // TRAINER-06: Use LOCAL time (getDay/getHours) instead of UTC methods
  // (getUTCDay/getUTCHours). The trainer schedule UI formats the availability
  // days/hours based on the browser's local timezone. If the server evaluates
  // them in UTC, a 9am Monday class in New York (EST, UTC-5) would evaluate as
  // 2pm Monday, potentially rejecting a valid slot or accepting an invalid one.
  const classStart = new Date(startsAt);
  const classEnd = new Date(classStart.getTime() + durationMin * 60000);

  // Rule: evaluate against the trainer's stated availability on the same local
  // day-of-week they selected in the UI.
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

  // -------------------------------------------------------------------------
  // Availability check — now uses LOCAL time via the shared helper.
  // Fix #3: Now exposed as a proper query that can be called from the UI or
  // server-side (classes.create/update enforce it too — see classes.ts).
  // Fix #6/#10: Delegates to checkTrainerAvailability() which uses getDay()
  // instead of getUTCDay() — local time matches UI display.
  // -------------------------------------------------------------------------
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
