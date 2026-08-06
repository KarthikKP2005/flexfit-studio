import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { bookings, classes, memberships, checkins, users, corporateBookings } from "@/db/schema";
import { router, protectedProcedure, staffProcedure } from "../trpc";
import { notifyWaitlistPromotion } from "../services/notifications";
import { formatDateTime } from "@/lib/format";

/**
 * Members may cancel free of charge up to this many hours before the class
 * starts. Cancelling later still frees the spot but forfeits the credit.
 */
export const FREE_CANCELLATION_HOURS = 12;

/** Plans with this many credits are treated as unlimited and never decrement. */
export const UNLIMITED_CREDITS = 999;

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

// ---------------------------------------------------------------------------
// Fix #18/#19: Single source-of-truth for "active membership".
// Checks status = active, endDate >= today, AND startDate <= today.
// ---------------------------------------------------------------------------
export async function activeMembershipFor(
  db: typeof import("@/db").db,
  userId: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
        sql`${memberships.startDate} <= ${today}`, // Fix #19: don't allow future memberships
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}

// ---------------------------------------------------------------------------
// Fix #6: Unified capacity check — counts BOTH normal + corporate bookings.
// ---------------------------------------------------------------------------
async function totalBookedCount(
  db: typeof import("@/db").db,
  classId: number,
): Promise<number> {
  const [{ normalCount }] = await db
    .select({ normalCount: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));

  const [{ corpCount }] = await db
    .select({ corpCount: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "booked"),
      ),
    );

  return Number(normalCount) + Number(corpCount);
}

// ---------------------------------------------------------------------------
// Fix #7/#12/#23: Unified waitlist promotion — picks the oldest waitlisted
// person across BOTH normal and corporate waitlists, checks credits, and
// sends a notification on promotion.
// ---------------------------------------------------------------------------
export async function promoteNextWaitlisted(
  db: typeof import("@/db").db,
  classId: number,
  cls: { creditCost: number; name: string; startsAt: string },
) {
  // Find oldest normal waitlisted
  const nextNormal = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.classId, classId), eq(bookings.status, "waitlisted")),
    )
    .orderBy(asc(bookings.bookedAt))
    .get();

  // Find oldest corporate waitlisted
  const nextCorp = await db
    .select()
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "waitlisted"),
      ),
    )
    .orderBy(asc(corporateBookings.bookedAt))
    .get();

  // Pick the oldest across both queues (Fix #7: unified fair order)
  type Candidate =
    | { type: "normal"; row: typeof nextNormal }
    | { type: "corporate"; row: typeof nextCorp };

  const candidates: Candidate[] = [];
  if (nextNormal) candidates.push({ type: "normal", row: nextNormal });
  if (nextCorp) candidates.push({ type: "corporate", row: nextCorp });

  if (candidates.length === 0) return;

  candidates.sort((a, b) =>
    (a.row!.bookedAt).localeCompare(b.row!.bookedAt),
  );

  const winner = candidates[0];

  if (winner.type === "normal" && winner.row) {
    const booking = winner.row;
    // Fix #9: Check credits BEFORE promoting — don't overdraw
    if (booking.membershipId) {
      const ms = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, booking.membershipId))
        .get();

      if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
        if (ms.creditsRemaining < cls.creditCost) {
          // Not enough credits — skip this person, leave waitlisted
          return;
        }
        // Deduct credits
        await db
          .update(memberships)
          .set({ creditsRemaining: ms.creditsRemaining - cls.creditCost })
          .where(eq(memberships.id, ms.id));
      }
    }

    await db
      .update(bookings)
      .set({ status: "booked", creditsUsed: cls.creditCost })
      .where(eq(bookings.id, booking.id));

    // Fix #23: Send notification
    await notifyWaitlistPromotion(
      db,
      booking.userId,
      cls.name,
      formatDateTime(cls.startsAt),
    );
  } else if (winner.type === "corporate" && winner.row) {
    const booking = winner.row;
    // Fix #8: Check company credits BEFORE promoting
    const { companies } = await import("@/db/schema");
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, booking.companyId))
      .get();

    if (!company || company.creditPoolBalance < cls.creditCost) {
      // Not enough company credits — skip
      return;
    }

    await db
      .update(companies)
      .set({ creditPoolBalance: company.creditPoolBalance - cls.creditCost })
      .where(eq(companies.id, company.id));

    await db
      .update(corporateBookings)
      .set({ status: "booked", creditsUsed: cls.creditCost })
      .where(eq(corporateBookings.id, booking.id));

    // Fix #23: Send notification
    await notifyWaitlistPromotion(
      db,
      booking.userId,
      cls.name,
      formatDateTime(cls.startsAt),
    );
  }
}

export const bookingsRouter = router({
  mine: protectedProcedure
    .input(z.object({ includePast: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: bookings.id,
          status: bookings.status,
          creditsUsed: bookings.creditsUsed,
          bookedAt: bookings.bookedAt,
          classId: classes.id,
          className: classes.name,
          room: classes.room,
          startsAt: classes.startsAt,
          durationMin: classes.durationMin,
          cancelled: classes.cancelled,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.userId, ctx.user.id))
        .orderBy(asc(classes.startsAt));

      const now = new Date();
      return rows.filter((r) =>
        input.includePast ? true : new Date(r.startsAt) >= now,
      );
    }),

  book: protectedProcedure
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cls = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, input.classId))
        .get();

      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }
      if (cls.cancelled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This class has been cancelled.",
        });
      }
      if (hoursUntil(cls.startsAt) <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This class has already started.",
        });
      }

      const existing = await ctx.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.classId, cls.id),
            eq(bookings.userId, ctx.user.id),
            inArray(bookings.status, ["booked", "waitlisted"]),
          ),
        )
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You are already on the list for this class.",
        });
      }

      const membership = await activeMembershipFor(ctx.db, ctx.user.id);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "An active membership is required to book classes.",
        });
      }

      const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
      if (!unlimited && membership.creditsRemaining < cls.creditCost) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enough class credits remaining.",
        });
      }

      // Fix #6: unified capacity — count BOTH normal + corporate bookings
      const count = await totalBookedCount(ctx.db, cls.id);
      const isFull = count >= cls.capacity;

      const created = await ctx.db
        .insert(bookings)
        .values({
          classId: cls.id,
          userId: ctx.user.id,
          membershipId: membership.id,
          status: isFull ? "waitlisted" : "booked",
          creditsUsed: isFull ? 0 : cls.creditCost,
        })
        .returning()
        .get();

      if (!isFull && !unlimited) {
        await ctx.db
          .update(memberships)
          .set({ creditsRemaining: membership.creditsRemaining - cls.creditCost })
          .where(eq(memberships.id, membership.id));
      }

      return created;
    }),

  cancel: protectedProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({ booking: bookings, cls: classes })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.id, input.bookingId))
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
      }

      const isOwner = row.booking.userId === ctx.user.id;
      const isStaff = ctx.user.role === "admin" || ctx.user.role === "trainer";
      if (!isOwner && !isStaff) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot cancel this booking.",
        });
      }

      if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This booking is no longer active.",
        });
      }

      const refundable =
        hoursUntil(row.cls.startsAt) >= FREE_CANCELLATION_HOURS &&
        row.booking.creditsUsed > 0;

      await ctx.db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
        .where(eq(bookings.id, row.booking.id));

      if (refundable && row.booking.membershipId) {
        const ms = await ctx.db
          .select()
          .from(memberships)
          .where(eq(memberships.id, row.booking.membershipId))
          .get();

        if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
          await ctx.db
            .update(memberships)
            .set({ creditsRemaining: ms.creditsRemaining + row.booking.creditsUsed })
            .where(eq(memberships.id, ms.id));
        }
      }

      // Fix #12: Promote next waitlisted (unified across both tables)
      if (row.booking.status === "booked") {
        await promoteNextWaitlisted(ctx.db, row.cls.id, row.cls);
      }

      return { ok: true, refunded: refundable };
    }),

  // Fix #26: markAttended no longer checks credit balance. The booking was
  // already paid for at booking time. Having 0 credits at check-in is valid.
  markAttended: staffProcedure
    .input(
      z.object({
        bookingId: z.number(),
        source: z.enum(["front_desk", "kiosk", "app"]).default("front_desk"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const booking = await ctx.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .get();

      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
      }
      if (booking.status !== "booked") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only confirmed bookings can be checked in.",
        });
      }

      await ctx.db
        .update(bookings)
        .set({ status: "attended" })
        .where(eq(bookings.id, booking.id));

      await ctx.db.insert(checkins).values({
        userId: booking.userId,
        bookingId: booking.id,
        source: input.source,
      });

      return { ok: true };
    }),

  // Fix #4/#9: rosterFor now returns normal + corporate bookings combined
  rosterFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      const normalRows = await ctx.db
        .select({
          bookingId: bookings.id,
          status: bookings.status,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          bookedAt: bookings.bookedAt,
          source: sql<"normal">`'normal'`.as("source"),
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(eq(bookings.classId, input.classId));

      const corpRows = await ctx.db
        .select({
          bookingId: corporateBookings.id,
          status: corporateBookings.status,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          bookedAt: corporateBookings.bookedAt,
          source: sql<"corporate">`'corporate'`.as("source"),
        })
        .from(corporateBookings)
        .innerJoin(users, eq(corporateBookings.userId, users.id))
        .where(eq(corporateBookings.classId, input.classId));

      return [
        ...normalRows.map((r) => ({ ...r, source: "normal" as const })),
        ...corpRows.map((r) => ({ ...r, source: "corporate" as const })),
      ].sort((a, b) => a.bookedAt.localeCompare(b.bookedAt));
    }),

  upcomingForMember: staffProcedure
    .input(z.object({ userId: z.number(), hoursAhead: z.number().default(2) }))
    .query(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const futureTime = new Date(Date.now() + input.hoursAhead * 60 * 60 * 1000).toISOString();

      return ctx.db
        .select({
          bookingId: bookings.id,
          bookingStatus: bookings.status,
          classId: classes.id,
          className: classes.name,
          room: classes.room,
          startsAt: classes.startsAt,
          durationMin: classes.durationMin,
          capacity: classes.capacity,
          trainerId: classes.trainerId,
          trainerName: users.name,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .leftJoin(users, eq(classes.trainerId, users.id))
        .where(
          and(
            eq(bookings.userId, input.userId),
            eq(bookings.status, "booked"),
            sql`${classes.startsAt} >= ${now}`,
            sql`${classes.startsAt} <= ${futureTime}`,
            eq(classes.cancelled, false),
          ),
        )
        .orderBy(classes.startsAt);
    }),

  checkinCountFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(checkins)
        .innerJoin(bookings, eq(checkins.bookingId, bookings.id))
        .where(eq(bookings.classId, input.classId));

      return { count: Number(result?.count ?? 0) };
    }),

  waitlisted: protectedProcedure.query(async ({ ctx }) => {
    const waitlistedBookings = await ctx.db
      .select({
        bookingId: bookings.id,
        classId: classes.id,
        className: classes.name,
        room: classes.room,
        startsAt: classes.startsAt,
        durationMin: classes.durationMin,
        capacity: classes.capacity,
        bookedAt: bookings.bookedAt,
      })
      .from(bookings)
      .innerJoin(classes, eq(bookings.classId, classes.id))
      .where(
        and(
          eq(bookings.userId, ctx.user.id),
          eq(bookings.status, "waitlisted"),
        ),
      )
      .orderBy(asc(classes.startsAt));

    const result = await Promise.all(
      waitlistedBookings.map(async (wb) => {
        const [{ position }] = await ctx.db
          .select({ position: sql<number>`count(*)` })
          .from(bookings)
          .where(
            and(
              eq(bookings.classId, wb.classId),
              eq(bookings.status, "waitlisted"),
              sql`${bookings.bookedAt} < ${wb.bookedAt}`,
            ),
          );

        return {
          ...wb,
          position: Number(position) + 1,
        };
      }),
    );

    return result;
  }),
});
