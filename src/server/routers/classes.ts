import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { classes, bookings, users } from "@/db/schema";
import { router, publicProcedure, staffProcedure, adminProcedure } from "../trpc";
import { cancelClass } from "@/features/bookings/class-cancellation-service";

/**
 * Class scheduling: public browse/detail, staff create/update, admin
 * cancel. `cancel` is a thin wrapper around
 * features/bookings/class-cancellation-service.ts's `cancelClass`
 * (CLASS-004, fixed) — all the actual cleanup logic (cancelling
 * personal/corporate bookings, refunding credits, notifying members)
 * lives there, not here, per Rule 7's "routers stay thin" guidance. Not
 * responsible for: enforcing trainer availability during create/update
 * (see trainers.ts's checkAvailability, never called from here —
 * CLASS-003-adjacent) or counting corporate bookings toward
 * capacity/roster in `list`'s spotsLeft (that's tracked in a separate
 * table entirely — see corporate-bookings.ts and ADMIN-001).
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
   * Marks a class cancelled and cleans up everything attached to it, via
   * the shared `cancelClass` (CLASS-004, fixed): cancels every still-
   * active booking on the class — personal AND corporate, `booked` AND
   * `waitlisted` — refunds credits for the ones that had actually paid
   * (unconditionally, no free-cancellation-window check; see that
   * function's own comment for the Rule 8 reasoning), and notifies every
   * affected member. The return value now includes a `summary` alongside
   * the class row, per plan.md's "structured cancellation summary" ask —
   * a deliberate output-shape change for this FIX (Rule 3), not something
   * any UI currently depends on (`cancel` has no frontend caller today).
   *
   * @throws NOT_FOUND if the class doesn't exist
   */
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await cancelClass(ctx.db, input.id);

      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }

      return result;
    }),
});
