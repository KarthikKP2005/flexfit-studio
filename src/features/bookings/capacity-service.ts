import { and, eq, sql } from "drizzle-orm";
import { bookings, corporateBookings } from "@/db/schema";

/**
 * Shared capacity/occupancy check for a class, counting confirmed
 * bookings from BOTH the personal (`bookings`) and corporate
 * (`corporateBookings`) tables — the fix for CORP-002 in
 * known-issues.md, which documented that `bookings.book` and
 * `corporateBookings.book` each judged "is this class full" from their
 * own table alone, so a class could be overbooked from either side.
 * Not responsible for: display/reporting accuracy — `classes.list`'s
 * spotsLeft, the trainer roster, and `admin.classUtilisation`
 * (ADMIN-001) still count personal bookings only; adopting this service
 * there is separate, not-yet-done follow-up work (see known-issues.md).
 */

/**
 * Confirmed (`status: "booked"`) occupancy for a class from each booking
 * source, plus the combined total.
 */
export async function getConfirmedOccupancy(
  db: typeof import("@/db").db,
  classId: number,
): Promise<{ personalBooked: number; corporateBooked: number; total: number }> {
  const [{ count: personalCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));

  const [{ count: corporateCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(and(eq(corporateBookings.classId, classId), eq(corporateBookings.status, "booked")));

  const personalBooked = Number(personalCount);
  const corporateBooked = Number(corporateCount);
  return { personalBooked, corporateBooked, total: personalBooked + corporateBooked };
}

/**
 * Whether a class's combined personal+corporate confirmed occupancy has
 * reached `capacity`. Does not itself prevent a race between the check
 * and the caller's subsequent insert — this pass fixes which *sources*
 * count toward capacity, not the check-then-insert race, which pre-dates
 * this fix and applies equally to both booking tables (see plan.md's
 * broader "no transactions" findings, out of scope here).
 */
export async function isClassFull(
  db: typeof import("@/db").db,
  classId: number,
  capacity: number,
): Promise<boolean> {
  const { total } = await getConfirmedOccupancy(db, classId);
  return total >= capacity;
}
