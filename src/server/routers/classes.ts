import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { classes, bookings, users, corporateBookings, memberships, companies, notifications } from "@/db/schema";
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
   *
   * Behavior note (see CLASS-003 in known-issues.md — not fixed here):
   * `trainerId` is only checked at the DB's foreign-key level (must be
   * an existing user id) — not validated as belonging to an active user
   * with role "trainer".
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
   *
   * Behavior note (see CLASS-002 in known-issues.md — not fixed here):
   * `capacity` can be set below the number of already-confirmed
   * bookings with no rejection.
   *
   * @throws NOT_FOUND if the class doesn't exist
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
      const updated = await ctx.db
        .update(classes)
        .set(patch)
        .where(eq(classes.id, id))
        .returning()
        .get();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }
      return updated;
    }),

  /**
   * Marks a class cancelled and cancels its currently-`booked` bookings.
   *
   * Behavior note (see CLASS-004 in known-issues.md — not fixed here):
   * this is a partial cleanup only — waitlisted bookings, all corporate
   * bookings (any status), membership/company credit restoration, and
   * member notifications are all left untouched.
   *
   * @throws NOT_FOUND if the class doesn't exist
   */
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
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
