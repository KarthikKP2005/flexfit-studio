import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  corporateBookings,
  classes,
  companies,
  companyMembers,
  checkins,
  users,
} from "@/db/schema";
import { router, protectedProcedure, staffProcedure } from "../trpc";
import { isClassFull } from "@/features/bookings/capacity-service";
import { promoteNextWaitlisted } from "@/features/bookings/waitlist-service";

/**
 * Corporate (company-credit-pool-funded) class bookings — structurally
 * parallel to bookings.ts's personal bookings, a separate table with its
 * own credit handling. Capacity and waitlist order are both now
 * reconciled with the personal side — `book` shares `isClassFull`
 * (CORP-002, fixed) and `cancel` shares `promoteNextWaitlisted`
 * (CORP-003, fixed), both in src/features/bookings/.
 * Not responsible for: which company a member belongs to when they
 * belong to more than one (see COMPANY-001 — getCompanyForMember below
 * just takes whichever active-company link `.get()` happens to return).
 */

/**
 * Corporate members may cancel free of charge up to this many hours before
 * the class starts. Cancelling later still frees the spot but forfeits the credit.
 */
export const CORPORATE_FREE_CANCELLATION_HOURS = 24;

/** Hours between `now` and an ISO timestamp (negative if `iso` is in the past). */
function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

/**
 * The active company this user is linked to, if any. Uses a single-row
 * `.get()` with no ordering — if a user is linked to more than one
 * active company (schema allows it, see COMPANY-001), which one this
 * returns is arbitrary.
 */
async function getCompanyForMember(
  db: typeof import("@/db").db,
  userId: number,
) {
  return db
    .select()
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companies.active, true),
      ),
    )
    .get();
}

export const corporateBookingsRouter = router({
  /** The caller's own corporate bookings, soonest first; past excluded unless includePast. */
  mine: protectedProcedure
    .input(z.object({ includePast: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: corporateBookings.id,
          status: corporateBookings.status,
          creditsUsed: corporateBookings.creditsUsed,
          bookedAt: corporateBookings.bookedAt,
          classId: classes.id,
          className: classes.name,
          room: classes.room,
          startsAt: classes.startsAt,
          durationMin: classes.durationMin,
          cancelled: classes.cancelled,
          companyName: companies.name,
        })
        .from(corporateBookings)
        .innerJoin(classes, eq(corporateBookings.classId, classes.id))
        .innerJoin(companies, eq(corporateBookings.companyId, companies.id))
        .where(eq(corporateBookings.userId, ctx.user.id))
        .orderBy(asc(classes.startsAt));

      const now = new Date();
      return rows.filter((r) =>
        input.includePast ? true : new Date(r.startsAt) >= now,
      );
    }),

  /**
   * Books the caller into a class against their linked company's credit
   * pool, or waitlists them if full. "Full" is judged from combined
   * personal + corporate confirmed bookings (CORP-002, fixed — see
   * features/bookings/capacity-service.ts) — a class already filled by
   * personal bookings now correctly waitlists a corporate booking too.
   *
   * @throws NOT_FOUND if the class doesn't exist
   * @throws BAD_REQUEST if the class is cancelled or has already started
   * @throws CONFLICT if the caller already has an active booking for this class
   * @throws FORBIDDEN if the caller isn't linked to an active company, or
   *   that company doesn't have enough credit pool balance
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
        .from(corporateBookings)
        .where(
          and(
            eq(corporateBookings.classId, cls.id),
            eq(corporateBookings.userId, ctx.user.id),
            inArray(corporateBookings.status, ["booked", "waitlisted"]),
          ),
        )
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You are already on the list for this class.",
        });
      }

      const companyRow = await getCompanyForMember(ctx.db, ctx.user.id);
      if (!companyRow) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not linked to an active company.",
        });
      }

      const company = companyRow.companies;
      if (company.creditPoolBalance < cls.creditCost) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your company does not have enough credits.",
        });
      }

      const isFull = await isClassFull(ctx.db, cls.id, cls.capacity);

      const created = await ctx.db
        .insert(corporateBookings)
        .values({
          classId: cls.id,
          userId: ctx.user.id,
          companyId: company.id,
          status: isFull ? "waitlisted" : "booked",
          creditsUsed: isFull ? 0 : cls.creditCost,
        })
        .returning()
        .get();

      if (!isFull) {
        await ctx.db
          .update(companies)
          .set({
            creditPoolBalance: company.creditPoolBalance - cls.creditCost,
          })
          .where(eq(companies.id, company.id));
      }

      return created;
    }),

  /**
   * Cancels a corporate booking and, if eligible, refunds the credit
   * pool. Also promotes the longest-waiting ELIGIBLE candidate into the
   * freed seat, if the cancelled booking was confirmed — checking BOTH
   * the corporate and personal waitlists together (CORP-003, fixed), and
   * verifying a corporate candidate's company credit before promoting
   * them, skipping to the next-oldest candidate if they can't afford it
   * (CORP-001, fixed) — see features/bookings/waitlist-service.ts.
   *
   * @throws NOT_FOUND if the booking doesn't exist
   * @throws FORBIDDEN if the caller doesn't own the booking and isn't staff
   * @throws BAD_REQUEST if the booking is already cancelled/attended
   */
  cancel: protectedProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({ booking: corporateBookings, cls: classes })
        .from(corporateBookings)
        .innerJoin(classes, eq(corporateBookings.classId, classes.id))
        .where(eq(corporateBookings.id, input.bookingId))
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
        hoursUntil(row.cls.startsAt) >= CORPORATE_FREE_CANCELLATION_HOURS &&
        row.booking.creditsUsed > 0;

      await ctx.db
        .update(corporateBookings)
        .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
        .where(eq(corporateBookings.id, row.booking.id));

      if (refundable) {
        const company = await ctx.db
          .select()
          .from(companies)
          .where(eq(companies.id, row.booking.companyId))
          .get();

        if (company) {
          await ctx.db
            .update(companies)
            .set({
              creditPoolBalance:
                company.creditPoolBalance + row.booking.creditsUsed,
            })
            .where(eq(companies.id, company.id));
        }
      }

      // Freeing a confirmed spot promotes whoever has waited longest and
      // is actually eligible, across BOTH waitlists (CORP-003/CORP-001/
      // BOOK-004, all fixed) — see features/bookings/waitlist-service.ts.
      if (row.booking.status === "booked") {
        await promoteNextWaitlisted(ctx.db, row.cls);
      }

      return { ok: true, refunded: refundable };
    }),

  /**
   * Checks a corporate booking's member in: marks the booking attended
   * and records a checkin row.
   *
   * Behavior note (see CORP-004 in known-issues.md — not fixed here):
   * `checkins.bookingId` only foreign-keys to the personal `bookings`
   * table, so the inserted checkin always has `bookingId: null` — it can
   * never be traced back to this corporate booking.
   *
   * @throws NOT_FOUND if the booking doesn't exist
   * @throws BAD_REQUEST if the booking isn't currently "booked"
   */
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
        .from(corporateBookings)
        .where(eq(corporateBookings.id, input.bookingId))
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
        .update(corporateBookings)
        .set({ status: "attended" })
        .where(eq(corporateBookings.id, booking.id));

      await ctx.db.insert(checkins).values({
        userId: booking.userId,
        bookingId: null,
      });

      return { ok: true };
    }),

  /** Every corporate booking (any status) for a class, with member and company name, oldest first. */
  rosterFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      const bookingRows = await ctx.db
        .select({
          bookingId: corporateBookings.id,
          status: corporateBookings.status,
          memberId: users.id,
          memberName: users.name,
          memberEmail: users.email,
          bookedAt: corporateBookings.bookedAt,
          companyName: companies.name,
        })
        .from(corporateBookings)
        .innerJoin(users, eq(corporateBookings.userId, users.id))
        .innerJoin(companies, eq(corporateBookings.companyId, companies.id))
        .where(eq(corporateBookings.classId, input.classId))
        .orderBy(asc(corporateBookings.bookedAt));

      return bookingRows;
    }),

  /**
   * The active company the caller themselves is linked to, if any — the
   * member-facing counterpart to `getCompanyForMember` above (which was
   * previously only used internally by `book`). Added for CORP-005 so the
   * UI can know whether to offer a company-credit booking option at all;
   * does not change `getCompanyForMember`'s own logic or its COMPANY-001
   * caveat (arbitrary pick if linked to more than one active company).
   */
  myCompany: protectedProcedure.query(async ({ ctx }) => {
    const row = await getCompanyForMember(ctx.db, ctx.user.id);
    if (!row) return null;

    return {
      id: row.companies.id,
      name: row.companies.name,
      creditPoolBalance: row.companies.creditPoolBalance,
    };
  }),
});
