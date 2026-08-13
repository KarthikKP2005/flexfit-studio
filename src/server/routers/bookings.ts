import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { bookings, classes, memberships, checkins, users, studioSettings } from "@/db/schema";
import { router, protectedProcedure, staffProcedure } from "../trpc";
import { isClassFull } from "@/features/bookings/capacity-service";
import { promoteNextWaitlisted } from "@/features/bookings/waitlist-service";
import { getCurrentMembership } from "@/features/memberships/current-membership";

/**
 * Personal (membership-credit-funded) class bookings: browse, book,
 * cancel, check-in, and waitlist. Not responsible for: corporate
 * bookings — corporate-bookings.ts is a structurally parallel but
 * entirely separate table/flow. Capacity and waitlist order *are* now
 * reconciled with it — `book` shares `isClassFull` (CORP-002, fixed) and
 * `cancel` shares `promoteNextWaitlisted` (CORP-003, fixed), both in
 * src/features/bookings/. Which membership a member is currently
 * eligible to book against is resolved by the shared
 * `getCurrentMembership` (MEMBER-002, fixed) in
 * src/features/memberships/ — this file no longer keeps its own copy.
 */

/**
 * Members may cancel free of charge up to this many hours before the class
 * starts. Cancelling later still frees the spot but forfeits the credit.
 */
export const FREE_CANCELLATION_HOURS = 12;

/** Plans with this many credits are treated as unlimited and never decrement. */
export const UNLIMITED_CREDITS = 999;

/** Hours between `now` and an ISO timestamp (negative if `iso` is in the past). */
function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

export const bookingsRouter = router({
  /** The caller's own bookings, soonest first; past classes excluded unless includePast. */
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

  /**
   * Books the caller into a class, or waitlists them if it's full.
   * Waitlisted bookings always have creditsUsed: 0 — credit is only
   * spent once a confirmed spot exists. "Full" is judged from combined
   * personal + corporate confirmed bookings (CORP-002, fixed — see
   * features/bookings/capacity-service.ts) — a class already filled by
   * corporate bookings now correctly waitlists here too.
   *
   * @throws NOT_FOUND if the class doesn't exist
   * @throws BAD_REQUEST if the class is cancelled or has already started
   * @throws CONFLICT if the caller already has an active (booked or
   *   waitlisted) booking for this class
   * @throws FORBIDDEN if the caller has no active membership, or their
   *   membership doesn't have enough credits for this class's creditCost
   */
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

      const membership = await getCurrentMembership(ctx.db, ctx.user.id);
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

      const created = await ctx.db.transaction(async (tx) => {
        const isFull = await isClassFull(tx, cls.id, cls.capacity);

        const newBooking = await tx
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
          await tx
            .update(memberships)
            .set({ creditsRemaining: membership.creditsRemaining - cls.creditCost })
            .where(eq(memberships.id, membership.id));
        }

        return newBooking;
      });

      return created;
    }),

  /**
   * Cancels a member's booking and, if eligible, refunds the credit.
   * Also promotes the longest-waiting ELIGIBLE candidate into the freed
   * seat, if the cancelled booking was a confirmed one — checking BOTH
   * the personal and corporate waitlists together (CORP-003, fixed), and
   * verifying a personal candidate's own membership credit before
   * promoting them, skipping to the next-oldest candidate if they can't
   * afford it (BOOK-004, fixed) — see features/bookings/waitlist-service.ts.
   *
   * Behavior note: refund only applies if cancelled
   * >= FREE_CANCELLATION_HOURS before class start, and only if the
   * booking had actually spent a credit.
   *
   * @throws NOT_FOUND if the booking doesn't exist
   * @throws FORBIDDEN if the caller doesn't own the booking and isn't staff
   * @throws BAD_REQUEST if the booking is already cancelled/attended
   */
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

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(bookings)
          .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
          .where(eq(bookings.id, row.booking.id));

        if (refundable && row.booking.membershipId) {
          const ms = await tx
            .select()
            .from(memberships)
            .where(eq(memberships.id, row.booking.membershipId))
            .get();

          if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
            await tx
              .update(memberships)
              .set({ creditsRemaining: ms.creditsRemaining + row.booking.creditsUsed })
              .where(eq(memberships.id, ms.id));
          }
        }

        // Freeing a confirmed spot promotes whoever has waited longest and
        // is actually eligible, across BOTH waitlists (CORP-003/CORP-001/
        // BOOK-004, all fixed) — see features/bookings/waitlist-service.ts.
        if (row.booking.status === "booked") {
          await promoteNextWaitlisted(tx, row.cls);
        }
      });

      return { ok: true, refunded: refundable };
    }),

  // WHY IT'S IMPLEMENTED: Waitlist "Walk-In" Admitting.
  // Trainers can manually admit someone from the waitlist who physically shows up.
  // We STRICTLY enforce the credit check here. If they have 0 credits, this blocks them.
  admitFromWaitlist: staffProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await ctx.db
        .select()
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .get();

      if (!booking || booking.status !== "waitlisted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking is not waitlisted.",
        });
      }

      const cls = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, booking.classId))
        .get();

      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });

      let ms: typeof memberships.$inferSelect | undefined;
      if (booking.membershipId) {
        ms = await ctx.db
          .select()
          .from(memberships)
          .where(eq(memberships.id, booking.membershipId))
          .get();

        if (ms && ms.creditsRemaining < 999 && ms.creditsRemaining < cls.creditCost) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Member has insufficient credits to be admitted.",
          });
        }
      }

      await ctx.db
        .update(bookings)
        .set({ status: "booked", creditsUsed: cls.creditCost })
        .where(eq(bookings.id, booking.id));

      if (ms && ms.creditsRemaining < 999) {
        await ctx.db
          .update(memberships)
          .set({ creditsRemaining: ms.creditsRemaining - cls.creditCost })
          .where(eq(memberships.id, ms.id));
      }

      return { ok: true };
    }),

  /**
   * Checks a member in: marks the booking attended and records a
   * checkin row. Two separate writes, not wrapped in a transaction.
   * Does not enforce a check-in time window server-side — the 2-hour
   * window in the kiosk UI is not re-verified here (a direct API call
   * could check in a booking for a class hours away).
   *
   * @throws NOT_FOUND if the booking doesn't exist
   * @throws BAD_REQUEST if the booking isn't currently "booked"
   */
  markAttended: staffProcedure
    .input(
      z.object({
        bookingId: z.number(),
        source: z.enum(["front_desk", "kiosk", "app", "trainer"]).default("front_desk"),
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

      const cls = await ctx.db
        .select()
        .from(classes)
        .where(eq(classes.id, booking.classId))
        .get();

      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }

      // WHY IT'S IMPLEMENTED: Infinite Check-in Window boundary. Check-ins are only allowed 
      // from dynamic studio-configured mins before the class starts until the class ends.
      let settingsRow = await ctx.db.select().from(studioSettings).limit(1).get();
      const windowMinutes = settingsRow?.checkinWindowMinutes ?? 30;

      const now = Date.now();
      const startMs = new Date(cls.startsAt).getTime();
      const endMs = startMs + cls.durationMin * 60000;
      if (now < startMs - windowMinutes * 60000 || now > endMs) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Check-in is only allowed from ${windowMinutes} minutes before class starts until it ends.`,
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

  /** Every personal booking (any status) for a class, with member name/email, oldest first. */
  rosterFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      const roster = await ctx.db
        .select({
          bookingId: bookings.id,
          status: bookings.status,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          bookedAt: bookings.bookedAt,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(eq(bookings.classId, input.classId))
        .orderBy(asc(bookings.bookedAt));

      // WHY IT'S IMPLEMENTED: First-Timer Badges.
      // We check if this member has ever attended any class (0 checkins)
      // to flag them to the trainer so they can be welcomed.
      return await Promise.all(
        roster.map(async (r) => {
          const pastCheckins = await ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(checkins)
            .where(eq(checkins.userId, r.memberId))
            .get();
          return { ...r, isFirstClass: pastCheckins?.count === 0 };
        })
      );
    }),

  /**
   * A member's confirmed, non-cancelled bookings starting within the
   * next `hoursAhead` hours (default 2) — used by the kiosk to show who
   * can check in soon. Personal bookings only; a corporate attendee's
   * upcoming classes aren't included (see corporate-bookings.ts).
   */
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

  /** Count of check-ins recorded against personal bookings for a class. */
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

  /** The caller's own waitlisted bookings, each with its 1-indexed queue position. */
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

    // For each of the caller's waitlisted bookings, count how many
    // other waitlisted bookings for that same class are older, to
    // derive this one's position in the queue.
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
          position: Number(position) + 1, // +1 because we're counting those before us
        };
      }),
    );

    return result;
  }),
});

