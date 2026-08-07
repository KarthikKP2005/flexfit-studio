import { and, asc, eq } from "drizzle-orm";
import {
  bookings,
  corporateBookings,
  memberships,
  companies,
  notifications,
} from "@/db/schema";

/**
 * Shared waitlist-promotion logic for a class, considering the personal
 * (`bookings`) and corporate (`corporateBookings`) waitlists TOGETHER —
 * the fix for CORP-003 in known-issues.md, which documented that
 * bookings.ts's `cancel` only ever promoted from the personal waitlist
 * and corporate-bookings.ts's `cancel` only ever promoted from the
 * corporate one, so a class seat could free up while an older candidate
 * on the *other* waitlist kept waiting behind a newer one.
 * Not responsible for: whether the promoted candidate can actually
 * afford the class — BOOK-004 (personal) and CORP-001 (corporate) are
 * both untouched here; this only changes which candidate is selected,
 * not what happens once one is (each source's own promotion mechanics,
 * bugs included, are preserved exactly as they were).
 */

/** Fields `promoteNextWaitlisted` needs from the class a seat just freed on. */
type PromotionClass = {
  id: number;
  name: string;
  startsAt: string;
  creditCost: number;
};

/**
 * Promotes the single oldest-waiting candidate for `cls`, comparing
 * `bookedAt` across both waitlists and picking whichever is genuinely
 * older — not just the older one *within* whichever table the caller
 * happens to be cancelling from. Does nothing if neither waitlist has a
 * candidate. Call only after confirming a `booked` row on `cls.id` was
 * just cancelled — this does not itself verify a seat was freed.
 */
export async function promoteNextWaitlisted(
  db: typeof import("@/db").db,
  cls: PromotionClass,
): Promise<void> {
  const oldestPersonal = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.classId, cls.id), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.bookedAt))
    .get();

  const oldestCorporate = await db
    .select()
    .from(corporateBookings)
    .where(
      and(eq(corporateBookings.classId, cls.id), eq(corporateBookings.status, "waitlisted")),
    )
    .orderBy(asc(corporateBookings.bookedAt))
    .get();

  if (!oldestPersonal && !oldestCorporate) {
    return;
  }

  const promotePersonal =
    !!oldestPersonal && (!oldestCorporate || oldestPersonal.bookedAt <= oldestCorporate.bookedAt);

  if (promotePersonal && oldestPersonal) {
    // Personal promotion mechanics, unchanged from bookings.ts's cancel
    // (see BOOK-004 — no credit recheck before promoting, floors at
    // zero with Math.max instead of rejecting).
    await db
      .update(bookings)
      .set({ status: "booked", creditsUsed: cls.creditCost })
      .where(eq(bookings.id, oldestPersonal.id));

    if (oldestPersonal.membershipId) {
      const ms = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, oldestPersonal.membershipId))
        .get();

      // 999 matches bookings.ts's UNLIMITED_CREDITS threshold.
      if (ms && ms.creditsRemaining < 999) {
        await db
          .update(memberships)
          .set({ creditsRemaining: Math.max(0, ms.creditsRemaining - cls.creditCost) })
          .where(eq(memberships.id, ms.id));
      }
    }

    await db.insert(notifications).values({
      userId: oldestPersonal.userId,
      type: "waitlist_promotion",
      title: "You're off the waitlist!",
      message: `You've been booked into ${cls.name} on ${cls.startsAt}.`,
    });
    return;
  }

  if (oldestCorporate) {
    // Corporate promotion mechanics, unchanged from corporate-bookings.ts's
    // cancel (see CORP-001 — confirms the booking before checking whether
    // the company can afford it; insufficient balance skips the
    // deduction but not the confirmation).
    await db
      .update(corporateBookings)
      .set({ status: "booked", creditsUsed: cls.creditCost })
      .where(eq(corporateBookings.id, oldestCorporate.id));

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, oldestCorporate.companyId))
      .get();

    if (company && company.creditPoolBalance >= cls.creditCost) {
      await db
        .update(companies)
        .set({ creditPoolBalance: Math.max(0, company.creditPoolBalance - cls.creditCost) })
        .where(eq(companies.id, company.id));
    }

    await db.insert(notifications).values({
      userId: oldestCorporate.userId,
      type: "waitlist_promotion",
      title: "You're off the waitlist!",
      message: `You've been booked into ${cls.name} on ${cls.startsAt}.`,
    });
  }
}
