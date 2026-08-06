import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { classes, bookings, users, memberships, corporateBookings, companies } from "@/db/schema";
import { router, publicProcedure, staffProcedure, adminProcedure } from "../trpc";
import { checkTrainerAvailability } from "./trainers";

export const classesRouter = router({
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

  // ---------------------------------------------------------------------------
  // byId is public for class details — but the roster (names + emails) is
  // intentionally NOT returned here. Trainers/staff must use
  // trainers.rosterWithCorporate or bookings.rosterFor instead.
  // ---------------------------------------------------------------------------
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

      // Return class details only — no member names/emails on a public endpoint.
      return cls;
    }),

  // ---------------------------------------------------------------------------
  // Fix #8: Validate trainerId is an existing, active trainer user.
  // Fix #7: Enforce that the class time falls within the trainer's availability.
  // TRAINER-07: Without this check, admins could freely schedule trainers
  // outside their working hours or double-book them in two rooms at once.
  // ---------------------------------------------------------------------------
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
      // Fix #8: validate trainerId if provided
      if (input.trainerId != null) {
        const trainer = await ctx.db
          .select({ id: users.id, role: users.role, active: users.active })
          .from(users)
          .where(eq(users.id, input.trainerId))
          .get();

        if (!trainer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer ID ${input.trainerId} does not exist.`,
          });
        }
        if (trainer.role !== "trainer") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `User ${input.trainerId} is not a trainer.`,
          });
        }
        if (!trainer.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer ${input.trainerId} is deactivated and cannot be assigned to classes.`,
          });
        }

        // TRAINER-07: Enforce availability server-side during creation.
        // Fails the request if the trainer is off-shift or already booked.
        const avail = await checkTrainerAvailability(
          ctx.db,
          input.trainerId,
          input.startsAt,
          input.durationMin,
        );
        if (!avail.available) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer is not available for this time slot: ${avail.reason}`,
          });
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

  // ---------------------------------------------------------------------------
  // Fix #7 (update path): Also enforce availability when updating a class's
  // start time or trainer assignment.
  // TRAINER-07: Crucially, we pass `id` (the current class ID) to
  // `checkTrainerAvailability` as `excludeClassId` so the class doesn't
  // falsely conflict with itself when we just change its room or capacity.
  // ---------------------------------------------------------------------------
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

      // If trainer or time is being changed, re-validate availability
      if (patch.trainerId != null && (patch.startsAt || patch.trainerId !== undefined)) {
        // Fetch the current class to fill in any fields not being changed
        const existingClass = await ctx.db
          .select()
          .from(classes)
          .where(eq(classes.id, id))
          .get();

        if (!existingClass) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
        }

        const effectiveTrainerId = patch.trainerId ?? existingClass.trainerId;
        const effectiveStartsAt = patch.startsAt ?? existingClass.startsAt;
        const effectiveDuration = existingClass.durationMin;

        // Fix #8: validate trainer still active and has trainer role
        const trainer = await ctx.db
          .select({ id: users.id, role: users.role, active: users.active })
          .from(users)
          .where(eq(users.id, effectiveTrainerId))
          .get();

        if (!trainer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer ID ${effectiveTrainerId} does not exist.`,
          });
        }
        if (trainer.role !== "trainer") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `User ${effectiveTrainerId} is not a trainer.`,
          });
        }
        if (!trainer.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer ${effectiveTrainerId} is deactivated.`,
          });
        }

        // TRAINER-07: Enforce availability during update, excluding current class
        // from the conflict check.
        const avail = await checkTrainerAvailability(
          ctx.db,
          effectiveTrainerId,
          effectiveStartsAt,
          effectiveDuration,
          id, // exclude current class from conflict check
        );
        if (!avail.available) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trainer is not available for this time slot: ${avail.reason}`,
          });
        }
      }

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

  // ---------------------------------------------------------------------------
  // Fix #14: Proper class cancellation — cancels ALL bookings (booked +
  // waitlisted) across both normal and corporate tables, refunds credits to
  // personal memberships and company credit pools, and sends notifications.
  // ---------------------------------------------------------------------------
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cls = await ctx.db
        .update(classes)
        .set({ cancelled: true })
        .where(eq(classes.id, input.id))
        .returning()
        .get();

      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }

      const { formatDateTime } = await import("@/lib/format");
      const { notifyClassCancelled } = await import("../services/notifications");

      // --- Cancel ALL normal bookings (booked + waitlisted) ---
      const activeNormalBookings = await ctx.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.classId, input.id),
            inArray(bookings.status, ["booked", "waitlisted"]),
          ),
        );

      for (const booking of activeNormalBookings) {
        await ctx.db
          .update(bookings)
          .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
          .where(eq(bookings.id, booking.id));

        // Refund credits for booked entries
        if (booking.creditsUsed > 0 && booking.membershipId) {
          const ms = await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, booking.membershipId))
            .get();

          if (ms && ms.creditsRemaining < 999) {
            await ctx.db
              .update(memberships)
              .set({ creditsRemaining: ms.creditsRemaining + booking.creditsUsed })
              .where(eq(memberships.id, ms.id));
          }
        }

        // Notify the member
        await notifyClassCancelled(
          ctx.db,
          booking.userId,
          cls.name,
          formatDateTime(cls.startsAt),
          booking.creditsUsed,
        );
      }

      // --- Cancel ALL corporate bookings (booked + waitlisted) ---
      const activeCorpBookings = await ctx.db
        .select()
        .from(corporateBookings)
        .where(
          and(
            eq(corporateBookings.classId, input.id),
            inArray(corporateBookings.status, ["booked", "waitlisted"]),
          ),
        );

      for (const booking of activeCorpBookings) {
        await ctx.db
          .update(corporateBookings)
          .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
          .where(eq(corporateBookings.id, booking.id));

        // Refund company credits for booked entries
        if (booking.creditsUsed > 0) {
          const company = await ctx.db
            .select()
            .from(companies)
            .where(eq(companies.id, booking.companyId))
            .get();

          if (company) {
            await ctx.db
              .update(companies)
              .set({
                creditPoolBalance: company.creditPoolBalance + booking.creditsUsed,
              })
              .where(eq(companies.id, company.id));
          }
        }

        // Notify the corporate member
        await notifyClassCancelled(
          ctx.db,
          booking.userId,
          cls.name,
          formatDateTime(cls.startsAt),
          booking.creditsUsed,
        );
      }

      return cls;
    }),
});
