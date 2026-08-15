import { and, eq, sql, inArray } from "drizzle-orm";
import { bookings, classes, checkins, users } from "@/db/schema";

/**
 * Phase 2.4 of restructure-plan.md: `admin.checkinsPerDay`,
 * `topTrainers`, and `noShowList`'s query logic, moved out of the router
 * unchanged. Not responsible for: corporate check-ins (`checkins.bookingId`
 * only ever references personal `bookings`, CORP-004, documented not
 * fixed — corporate attendance is invisible to all three functions
 * here) or ever actually setting a booking to `no_show` (nothing in the
 * live app does this outside seed data — `getNoShowList` just queries
 * whatever exists).
 */

/** Check-in counts grouped by calendar date, over the last 14 days. */
export async function getCheckinsPerDay(db: typeof import("@/db").db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);

  const rows = await db
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
}

/** Top 10 trainers by attended-booking count over the last 14 days. */
export async function getTopTrainers(db: typeof import("@/db").db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);

  const rows = await db
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
}

/**
 * Bookings marked `no_show` in the last 14 days, with trainer name
 * resolved via a second batched lookup.
 */
export async function getNoShowList(db: typeof import("@/db").db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);

  const rows = await db
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
    const trainerRows = await db
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
}
