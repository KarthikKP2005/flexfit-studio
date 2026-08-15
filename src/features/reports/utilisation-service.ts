import { eq, sql } from "drizzle-orm";
import { classes, bookings } from "@/db/schema";

/**
 * Phase 2.4 of restructure-plan.md: `admin.classUtilisation`'s query
 * logic, moved out of the router unchanged. Not responsible for:
 * corporate bookings (ADMIN-001, documented not fixed — counts personal
 * `bookings` only) or the correlated-subquery-as-column bug this query
 * shape has (ADMIN-003, documented not fixed here — `booked` always
 * evaluates to 0 regardless of real booking counts; preserved exactly
 * per Rule 3, not silently corrected during this move).
 */
export async function getClassUtilisation(db: typeof import("@/db").db, limit: number) {
  const rows = await db
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
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    booked: Number(r.booked),
    utilisation: r.capacity ? Number(r.booked) / r.capacity : 0,
  }));
}
