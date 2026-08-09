import { z } from "zod";
import { and, eq, gte, sql, lte, desc, inArray } from "drizzle-orm";
import {
  users,
  memberships,
  classes,
  bookings,
  payments,
  checkins,
  membershipPlans,
  studioSettings,
  corporateBookings,
} from "@/db/schema";
import { router, adminProcedure } from "../trpc";
import { notifyExpiringMemberships } from "../jobs/membership-expiry";

/**
 * Read-only admin dashboard/report queries. Not responsible for: any
 * mutation (see plans.ts/payments.ts/classes.ts/members.ts for those) or
 * accounting for corporate bookings/revenue — every aggregate here reads
 * from `bookings`/`payments` only, never `corporateBookings` (see
 * ADMIN-001/ADMIN-002 in known-issues.md).
 */

export const adminRouter = router({
  /** Headline counts for the admin dashboard. */
  stats: adminProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const [{ totalMembers }] = await ctx.db
      .select({ totalMembers: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "member"));

    const [{ activeMemberships }] = await ctx.db
      .select({ activeMemberships: sql<number>`count(*)` })
      .from(memberships)
      .where(
        and(
          eq(memberships.status, "active"),
          sql`${memberships.endDate} >= ${today}`,
        ),
      );

    const [{ upcomingClasses }] = await ctx.db
      .select({ upcomingClasses: sql<number>`count(*)` })
      .from(classes)
      .where(and(gte(classes.startsAt, now), eq(classes.cancelled, false)));

    const [{ revenueCents }] = await ctx.db
      .select({ revenueCents: sql<number>`coalesce(sum(${membershipPlans.priceCents}), 0)` })
      .from(memberships)
      .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(
        and(
          eq(memberships.status, "active"),
          sql`${memberships.endDate} >= ${today}`
        )
      );

    const [{ totalCheckins }] = await ctx.db
      .select({ totalCheckins: sql<number>`count(*)` })
      .from(checkins);

    const [{ pendingPayments }] = await ctx.db
      .select({ pendingPayments: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.status, "pending"));

    return {
      totalMembers: Number(totalMembers),
      activeMemberships: Number(activeMemberships),
      upcomingClasses: Number(upcomingClasses),
      revenueCents: Number(revenueCents),
      totalCheckins: Number(totalCheckins),
      pendingPayments: Number(pendingPayments),
    };
  }),

  /**
   * Up to `limit` non-cancelled classes with a booked count and
   * utilisation ratio.
   *
   * Behavior notes (see ADMIN-001 in known-issues.md — not fixed here):
   * `booked` only counts `bookings` rows (booked/attended) — corporate
   * bookings on the same class are invisible to this number. There's
   * also no ordering, so which classes fill the `limit` slots isn't
   * defined as "soonest" or "highest utilisation" — whatever order the
   * database happens to return them in.
   */
  classUtilisation: adminProcedure
    .input(z.object({ limit: z.number().default(10) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: classes.id,
          name: classes.name,
          startsAt: classes.startsAt,
          capacity: classes.capacity,
          booked: sql<number>`(
            select count(*) from ${bookings}
            where ${bookings.classId} = ${classes.id}
              and ${bookings.status} in ('booked','attended')
          )`.as("booked"),
        })
        .from(classes)
        .where(eq(classes.cancelled, false))
        .limit(input.limit);

      return rows.map((r) => ({
        ...r,
        booked: Number(r.booked),
        utilisation: r.capacity ? Number(r.booked) / r.capacity : 0,
      }));
    }),

  /**
   * Total paid-payment revenue grouped by month, newest first.
   *
   * Behavior note (see ADMIN-002 in known-issues.md — not fixed here):
   * corporate credit top-ups (admin-companies.ts's topUp) never create a
   * payments row, so they're invisible here.
   */
  revenueByMonth: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        month: sql<string>`strftime('%Y-%m', ${payments.createdAt})`,
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .where(eq(payments.status, "paid"))
      .groupBy(sql`strftime('%Y-%m', ${payments.createdAt})`)
      .orderBy(sql`strftime('%Y-%m', ${payments.createdAt}) DESC`);

    return rows.map((r) => ({
      month: r.month,
      totalCents: Number(r.totalCents),
    }));
  }),

  /** Total paid-payment revenue and count grouped by payment method, highest first. */
  revenueByMethod: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        method: payments.method,
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(payments)
      .where(eq(payments.status, "paid"))
      .groupBy(payments.method)
      .orderBy(sql`sum(${payments.amountCents}) DESC`);

    return rows.map((r) => ({
      method: r.method,
      totalCents: Number(r.totalCents),
      count: Number(r.count),
    }));
  }),

  /**
   * Trainer Payroll (Total Heads).
   * Bypasses `checkins` due to missing `bookingId` for corporate bookings.
   * Calculates total attended bookings grouped by trainer.
   */
  trainerPayroll: adminProcedure.query(async ({ ctx }) => {
    // Current month filter
    const rows = await ctx.db.execute(sql`
      SELECT u.name as trainerName, 
             (COUNT(DISTINCT b.id) + COUNT(DISTINCT cb.id)) as totalHeads
      FROM ${classes} c
      JOIN ${users} u ON c.trainer_id = u.id
      LEFT JOIN ${bookings} b ON b.class_id = c.id AND b.status = 'attended'
      LEFT JOIN ${corporateBookings} cb ON cb.class_id = c.id AND cb.status = 'attended'
      WHERE strftime('%Y-%m', c.starts_at) = strftime('%Y-%m', 'now')
      GROUP BY u.id, u.name
      ORDER BY totalHeads DESC
    `);

    return rows.rows.map(r => ({
      trainerName: String(r.trainerName),
      totalHeads: Number(r.totalHeads),
    }));
  }),

  /** Get studio settings */
  settings: adminProcedure.query(async ({ ctx }) => {
    let settingsRow = await ctx.db.select().from(studioSettings).limit(1).get();
    if (!settingsRow) {
      settingsRow = await ctx.db.insert(studioSettings).values({ checkinWindowMinutes: 30 }).returning().get();
    }
    return settingsRow;
  }),

  /** Update studio settings */
  updateSettings: adminProcedure
    .input(z.object({ checkinWindowMinutes: z.number().int().min(5).max(1440) }))
    .mutation(async ({ ctx, input }) => {
      let settingsRow = await ctx.db.select().from(studioSettings).limit(1).get();
      if (!settingsRow) {
        return ctx.db.insert(studioSettings).values(input).returning().get();
      }
      return ctx.db
        .update(studioSettings)
        .set(input)
        .where(eq(studioSettings.id, settingsRow.id))
        .returning()
        .get();
    }),

  /**
   * Manually runs the same membership-expiry notification job the
   * standalone daily cron process runs (see server/cron.ts /
   * jobs/membership-expiry.ts, both NOTIF-004) — lets an admin send
   * reminders on demand without needing `pnpm cron` running, and is how
   * this feature gets tested. Running it twice in one day sends
   * duplicate reminders — see membership-expiry.ts's header comment for
   * why that's an accepted tradeoff rather than a bug.
   */
  runMembershipExpiryCheck: adminProcedure.mutation(async () => {
    return notifyExpiringMemberships();
  }),

  /** Active memberships whose endDate falls within the next 14 days. */
  expiringMemberships: adminProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10);
    const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await ctx.db
      .select({
        memberId: users.id,
        memberName: users.name,
        memberEmail: users.email,
        planName: membershipPlans.name,
        expiresAt: memberships.endDate,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(
        and(
          eq(memberships.status, "active"),
          gte(memberships.endDate, today),
          lte(memberships.endDate, in14Days),
        ),
      )
      .orderBy(memberships.endDate);

    return rows;
  }),

  /** Total count of refunded payments (all time). */
  refundCount: adminProcedure.query(async ({ ctx }) => {
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.status, "refunded"));

    return { count: Number(result.count) };
  }),

  /** Check-in counts grouped by calendar date, over the last 14 days. */
  checkinsPerDay: adminProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const startStr = start.toISOString().slice(0, 10);

    const rows = await ctx.db
      .select({
        date: sql<string>`date(${checkins.checkedInAt})`,
        count: sql<number>`count(*)`,
      })
      .from(checkins)
      .where(sql`date(${checkins.checkedInAt}) >= ${startStr}`)
      .groupBy(sql`date(${checkins.checkedInAt})`)
      .orderBy(sql`date(${checkins.checkedInAt}) DESC`);

    return rows.map((r) => ({
      date: r.date,
      count: Number(r.count),
    }));
  }),

  /** Top 10 trainers by attended-booking count over the last 14 days. */
  topTrainers: adminProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const startStr = start.toISOString().slice(0, 10);

    const rows = await ctx.db
      .select({
        trainerId: classes.trainerId,
        trainerName: users.name,
        classCount: sql<number>`count(distinct ${bookings.classId})`,
        attendedCount: sql<number>`count(${bookings.id})`,
      })
      .from(bookings)
      .innerJoin(classes, eq(bookings.classId, classes.id))
      .innerJoin(users, eq(classes.trainerId, users.id))
      .where(
        and(
          eq(bookings.status, "attended"),
          sql`date(${classes.startsAt}) >= ${startStr}`,
        ),
      )
      .groupBy(classes.trainerId, users.name)
      .orderBy(sql`count(${bookings.id}) DESC`)
      .limit(10);

    return rows.map((r) => ({
      trainerId: r.trainerId,
      trainerName: r.trainerName,
      classCount: Number(r.classCount),
      attendedCount: Number(r.attendedCount),
    }));
  }),

  /**
   * Bookings marked `no_show` in the last 14 days, with trainer name
   * resolved via a second lookup.
   *
   * Behavior note: nothing in the codebase currently sets a booking's
   * status to `no_show` outside of seed data — no admin action or
   * scheduled job transitions a `booked` row to `no_show` after the
   * class passes, so in a live (non-seeded) system this list stays
   * empty indefinitely.
   */
  noShowList: adminProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const startStr = start.toISOString().slice(0, 10);

    const rows = await ctx.db
      .select({
        bookingId: bookings.id,
        memberId: users.id,
        memberName: users.name,
        memberEmail: users.email,
        className: classes.name,
        classDate: classes.startsAt,
        trainerId: classes.trainerId,
      })
      .from(bookings)
      .innerJoin(classes, eq(bookings.classId, classes.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(
        and(
          eq(bookings.status, "no_show"),
          sql`date(${classes.startsAt}) >= ${startStr}`,
        ),
      )
      .orderBy(sql`${classes.startsAt} DESC`);

    const trainerIds = [...new Set(rows.map((r) => r.trainerId).filter((id) => id != null))];
    const trainers = new Map<number | null, string>();

    // Resolve every distinct trainerId seen across the no-show rows to a
    // name in one batched lookup, rather than one query per row.
    if (trainerIds.length > 0) {
      const trainerRows = await ctx.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, trainerIds as number[]));

      trainerRows.forEach((t) => {
        trainers.set(t.id, t.name);
      });
    }

    return rows.map((r) => ({
      bookingId: r.bookingId,
      memberId: r.memberId,
      memberName: r.memberName,
      memberEmail: r.memberEmail,
      className: r.className,
      classDate: r.classDate,
      trainerId: r.trainerId,
      trainerName: r.trainerId ? trainers.get(r.trainerId) : undefined,
    }));
  }),
});
