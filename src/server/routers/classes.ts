import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { classes, bookings, users, trainerAvailability, memberships, notifications, corporateBookings, companies } from "@/db/schema";
import { router, publicProcedure, staffProcedure, adminProcedure } from "../trpc";

/**
 * Class scheduling: public browse/detail, staff create/update, admin
 * cancel. Not responsible for: enforcing trainer availability during
 * create/update (see trainers.ts's checkAvailability, never called from
 * here — CLASS-003-adjacent) or counting corporate bookings toward
 * capacity/roster (that's tracked in a separate table entirely — see
 * corporate-bookings.ts).
 */

export const classesRouter = router({
  /**
   * Upcoming (or date-ranged) classes, cancelled excluded unless
   * includeCancelled is set. spotsLeft/full are computed from `booked`
   * status bookings only — waitlisted/attended/cancelled don't count
   * against capacity, and neither do corporate bookings.
   */
  list: publicProcedure
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          includeCancelled: z.boolean().default(false),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const filters = [];
      if (input.from) filters.push(gte(classes.startsAt, input.from));
      if (input.to) filters.push(lte(classes.startsAt, input.to));
      if (!input.includeCancelled) filters.push(eq(classes.cancelled, false));

      const rows = await ctx.db
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
          trainerName: users.name,
          booked: sql<number>`(
            select count(*) from ${bookings}
            where ${bookings.classId} = ${classes.id}
              and ${bookings.status} = 'booked'
          )`.as("booked"),
        })
        .from(classes)
        .leftJoin(users, eq(classes.trainerId, users.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(asc(classes.startsAt));

      return rows.map((r) => ({
        ...r,
        spotsLeft: Math.max(0, r.capacity - Number(r.booked)),
        full: Number(r.booked) >= r.capacity,
      }));
    }),

  /**
   * Class detail plus its roster.
   *
   * Behavior note (see CLASS-001 in known-issues.md — not fixed here):
   * this is publicProcedure, but the roster it returns includes every
   * attendee's name and email, with no sign-in required.
   *
   * @throws NOT_FOUND if the class doesn't exist
   */
  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const cls = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.id))
        .get();

      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }

      const roster = await ctx.db
        .select({
          bookingId: bookings.id,
          status: bookings.status,
          memberName: users.name,
          memberEmail: users.email,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(eq(bookings.classId, cls.id));

      return { ...cls, roster };
    }),

  /**
   * Creates a class.
   * FIX(trainer): `trainerId` is now validated to ensure the user is an active trainer.
   * FIX(trainer): Enforces trainer availability to prevent scheduling conflicts.
   */
  create: staffProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        trainerId: z.number().optional(),
        room: z.string().min(1),
        capacity: z.number().int().positive(),
        startsAt: z.string(),
        durationMin: z.number().int().positive().default(60),
        creditCost: z.number().int().min(0).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // If a trainer is calling create, they can only assign themselves (or we can just restrict them entirely)
      // The user issue #1 says "Can't cancel or edit own classes", but doesn't mention creating. Let's assume trainers can create classes for themselves.
      if (ctx.user.role === "trainer") {
        if (input.trainerId && input.trainerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Trainers can only create classes for themselves." });
        }
        input.trainerId = ctx.user.id;
      }

      if (input.trainerId) {
        const trainerUser = await ctx.db.select().from(users).where(eq(users.id, input.trainerId)).get();
        if (!trainerUser || trainerUser.role !== "trainer" || !trainerUser.active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid trainer selected." });
        }

        // Validate Availability (Problem #7)
        const classStart = new Date(input.startsAt);
        const classEnd = new Date(classStart.getTime() + input.durationMin * 60000);
        const dayOfWeek = classStart.getDay();
        const startTimeStr = String(classStart.getHours()).padStart(2, "0") + ":" + String(classStart.getMinutes()).padStart(2, "0");
        const endTimeStr = String(classEnd.getHours()).padStart(2, "0") + ":" + String(classEnd.getMinutes()).padStart(2, "0");

        const avail = await ctx.db.select().from(trainerAvailability)
          .where(and(eq(trainerAvailability.trainerId, input.trainerId), eq(trainerAvailability.dayOfWeek, dayOfWeek)))
          .get();
        if (!avail) throw new TRPCError({ code: "BAD_REQUEST", message: "Trainer has no availability on this day." });
        if (startTimeStr < avail.startTime || endTimeStr > avail.endTime) throw new TRPCError({ code: "BAD_REQUEST", message: "Class falls outside trainer's available hours." });

        const conflicts = await ctx.db.select().from(classes).where(and(eq(classes.trainerId, input.trainerId), eq(classes.cancelled, false)));
        for (const c of conflicts) {
          const existStart = new Date(c.startsAt);
          const existEnd = new Date(existStart.getTime() + c.durationMin * 60000);
          if (classStart < existEnd && classEnd > existStart) throw new TRPCError({ code: "CONFLICT", message: "Trainer already has a class at this time." });
        }
      }

      return ctx.db
        .insert(classes)
        .values({
          ...input,
          description: input.description ?? null,
          trainerId: input.trainerId ?? null,
        })
        .returning()
        .get();
    }),

  /**
   * Patches the given fields of a class.
   * FIX(trainer): Allows trainers to edit their own classes.
   * FIX(trainer): Enforces trainer availability checking on update.
   */
  update: staffProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        room: z.string().min(1).optional(),
        capacity: z.number().int().positive().optional(),
        startsAt: z.string().optional(),
        trainerId: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      
      const existingCls = await ctx.db.select().from(classes).where(eq(classes.id, id)).get();
      if (!existingCls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });

      if (ctx.user.role === "trainer") {
        if (existingCls.trainerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Trainers can only edit their own classes." });
        }
        if (patch.trainerId !== undefined && patch.trainerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Trainers cannot assign classes to someone else." });
        }
      }

      const targetTrainerId = patch.trainerId !== undefined ? patch.trainerId : existingCls.trainerId;
      const targetStartsAt = patch.startsAt !== undefined ? patch.startsAt : existingCls.startsAt;
      // Note: duration isn't currently editable, but we use the existing one
      const targetDuration = existingCls.durationMin; 

      if (targetTrainerId) {
        if (patch.trainerId !== undefined && patch.trainerId !== existingCls.trainerId) {
          const trainerUser = await ctx.db.select().from(users).where(eq(users.id, targetTrainerId)).get();
          if (!trainerUser || trainerUser.role !== "trainer" || !trainerUser.active) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid trainer selected." });
          }
        }

        if (patch.startsAt !== undefined || patch.trainerId !== undefined) {
          const classStart = new Date(targetStartsAt);
          const classEnd = new Date(classStart.getTime() + targetDuration * 60000);
          const dayOfWeek = classStart.getDay();
          const startTimeStr = String(classStart.getHours()).padStart(2, "0") + ":" + String(classStart.getMinutes()).padStart(2, "0");
          const endTimeStr = String(classEnd.getHours()).padStart(2, "0") + ":" + String(classEnd.getMinutes()).padStart(2, "0");

          const avail = await ctx.db.select().from(trainerAvailability)
            .where(and(eq(trainerAvailability.trainerId, targetTrainerId), eq(trainerAvailability.dayOfWeek, dayOfWeek)))
            .get();
          if (!avail) throw new TRPCError({ code: "BAD_REQUEST", message: "Trainer has no availability on this day." });
          if (startTimeStr < avail.startTime || endTimeStr > avail.endTime) throw new TRPCError({ code: "BAD_REQUEST", message: "Class falls outside trainer's available hours." });

          const conflicts = await ctx.db.select().from(classes).where(and(eq(classes.trainerId, targetTrainerId), eq(classes.cancelled, false)));
          for (const c of conflicts) {
            if (c.id === id) continue;
            const existStart = new Date(c.startsAt);
            const existEnd = new Date(existStart.getTime() + c.durationMin * 60000);
            if (classStart < existEnd && classEnd > existStart) throw new TRPCError({ code: "CONFLICT", message: "Trainer already has a class at this time." });
          }
        }
      }

      const updated = await ctx.db
        .update(classes)
        .set(patch)
        .where(eq(classes.id, id))
        .returning()
        .get();

      return updated;
    }),

  /**
   * Marks a class cancelled and cancels its currently-`booked` bookings.
   * FIX(trainer): Allows trainers to cancel their own classes.
   */
  cancel: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const existingCls = await tx.select().from(classes).where(eq(classes.id, input.id)).get();
        if (!existingCls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });

        if (ctx.user.role === "trainer" && existingCls.trainerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Trainers can only cancel their own classes." });
        }

        const cls = await tx
          .update(classes)
          .set({ cancelled: true })
          .where(eq(classes.id, input.id))
          .returning()
          .get();

        if (!cls) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
        }

        // 1. Get all booked and waitlisted personal bookings
        const personalBookings = await tx
          .select({
            id: bookings.id,
            status: bookings.status,
            userId: bookings.userId,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.classId, input.id),
              or(eq(bookings.status, "booked"), eq(bookings.status, "waitlist"))
            )
          );

        // Refund personal credits for 'booked' only
        for (const pb of personalBookings) {
          if (pb.status === "booked") {
            const member = await tx.select({ id: users.id }).from(users).where(eq(users.id, pb.userId)).get();
            const membership = await tx
              .select({ id: memberships.id, creditsRemaining: memberships.creditsRemaining })
              .from(memberships)
              .where(and(eq(memberships.userId, pb.userId), eq(memberships.status, "active")))
              .get();
              
            if (membership) {
              await tx
                .update(memberships)
                .set({ creditsRemaining: membership.creditsRemaining + cls.creditCost })
                .where(eq(memberships.id, membership.id));
            }
          }
          // Cancel booking/waitlist
          await tx
            .update(bookings)
            .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
            .where(eq(bookings.id, pb.id));
            
          // Notify
          await tx.insert(notifications).values({
            userId: pb.userId,
            type: "class_cancelled",
            title: "Class Cancelled",
            message: `Your class ${cls.name} has been cancelled.`,
          });
        }

        // 2. Get all booked and waitlisted corporate bookings
        const corpBookings = await tx
          .select({
            id: corporateBookings.id,
            status: corporateBookings.status,
            userId: corporateBookings.userId,
            companyId: corporateBookings.companyId,
          })
          .from(corporateBookings)
          .where(
            and(
              eq(corporateBookings.classId, input.id),
              or(eq(corporateBookings.status, "booked"), eq(corporateBookings.status, "waitlist"))
            )
          );

        for (const cb of corpBookings) {
          if (cb.status === "booked") {
            const company = await tx
              .select({ id: companies.id, creditPoolBalance: companies.creditPoolBalance })
              .from(companies)
              .where(eq(companies.id, cb.companyId))
              .get();
              
            if (company) {
              await tx
                .update(companies)
                .set({ creditPoolBalance: company.creditPoolBalance + cls.creditCost })
                .where(eq(companies.id, cb.companyId));
            }
          }
          
          await tx
            .update(corporateBookings)
            .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
            .where(eq(corporateBookings.id, cb.id));
            
          await tx.insert(notifications).values({
            userId: cb.userId,
            type: "class_cancelled",
            title: "Class Cancelled",
            message: `Your corporate class ${cls.name} has been cancelled.`,
          });
        }

        return cls;
      });
    }),
});
