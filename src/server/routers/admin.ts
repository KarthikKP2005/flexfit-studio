import { z } from "zod";
import { and, eq, gte, sql, lte } from "drizzle-orm";
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
import { getClassUtilisation } from "@/features/reports/utilisation-service";
import { getRevenueByMonth, getRevenueByMethod } from "@/features/reports/revenue-service";
import { getCheckinsPerDay, getTopTrainers, getNoShowList } from "@/features/attendance/no-show-service";

/**
 * Read-only admin dashboard/report queries. Not responsible for: any
 * mutation (see plans.ts/payments.ts/classes.ts/members.ts for those) or
 * accounting for corporate bookings/revenue — every aggregate here reads
 * from `bookings`/`payments` only, never `corporateBookings` (see
 * ADMIN-001/ADMIN-002 in known-issues.md). Utilisation, revenue, and
 * attendance/no-show query logic live in `src/features/reports/` and
 * `src/features/attendance/` (Phase 2.4 of restructure-plan.md) — this
 * router just validates input and calls them. `stats`, `trainerPayroll`,
 * `settings`/`updateSettings`, `runMembershipExpiryCheck`,
 * `expiringMemberships`, and `refundCount` stay inline here — smaller,
 * less duplicated, not part of that extraction's stated scope.
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
   * database happens to return them in. Separately, ADMIN-003
   * (documented not fixed): `booked` always evaluates to 0 regardless of
   * real booking counts, a drizzle-orm correlated-subquery-as-column
   * compilation issue — see `utilisation-service.ts`.
   */
  classUtilisation: adminProcedure
    .input(z.object({ limit: z.number().default(10) }).default({}))
    .query(({ ctx, input }) => getClassUtilisation(ctx.db, input.limit)),

  /**
   * Total paid-payment revenue grouped by month, newest first.
   *
   * Behavior note (see ADMIN-002 in known-issues.md — not fixed here):
   * corporate credit top-ups (admin-companies.ts's topUp) never create a
   * payments row, so they're invisible here.
   */
  revenueByMonth: adminProcedure.query(({ ctx }) => getRevenueByMonth(ctx.db)),

  /** Total paid-payment revenue and count grouped by payment method, highest first. */
  revenueByMethod: adminProcedure.query(({ ctx }) => getRevenueByMethod(ctx.db)),

  /**
   * Trainer Payroll (Total Heads).
   * Bypasses `checkins` due to missing `bookingId` for corporate bookings.
   * Calculates total attended bookings grouped by trainer.
   */
  trainerPayroll: adminProcedure.query(async ({ ctx }) => {
    // Current month filter
    const rows = await ctx.db.all(sql`
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

    return rows.map((r: any) => ({
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
  checkinsPerDay: adminProcedure.query(({ ctx }) => getCheckinsPerDay(ctx.db)),

  /** Top 10 trainers by attended-booking count over the last 14 days. */
  topTrainers: adminProcedure.query(({ ctx }) => getTopTrainers(ctx.db)),

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
  noShowList: adminProcedure.query(({ ctx }) => getNoShowList(ctx.db)),
});
