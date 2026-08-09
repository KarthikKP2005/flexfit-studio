import { and, eq, inArray } from "drizzle-orm";
import {
  classes,
  bookings,
  corporateBookings,
  memberships,
  companies,
  notifications,
} from "@/db/schema";

/**
 * Cancelling an entire class — the fix for CLASS-004 in known-issues.md,
 * which documented that `classes.ts`'s `cancel` only cancelled confirmed
 * (`booked`) personal bookings, leaving waitlisted personal bookings,
 * every corporate booking (any status), and both credit sources
 * completely untouched. Not responsible for: enforcing who is allowed to
 * call this (that stays in `classes.ts`'s `adminProcedure` guard) or the
 * check-then-write race this shares with every other multi-step booking
 * flow in this app (plan.md's broader "no transactions" finding, out of
 * scope here — see capacity-service.ts's identical note).
 */

/** What actually changed, for the caller to report back to the admin. */
export type ClassCancellationSummary = {
  cancelledBookings: number;
  cancelledCorporateBookings: number;
  creditsRefunded: number;
  companyCreditsRefunded: number;
};

/**
 * Marks a class cancelled and cleans up everything attached to it:
 * cancels every still-active booking (personal AND corporate, `booked`
 * AND `waitlisted`), refunds credits for the ones that had actually paid,
 * and notifies every affected member.
 *
 * Refund policy (CLASS-004, Rule 8 — plan.md doesn't specify a time
 * window here, unlike `bookings.ts`'s/`corporate-bookings.ts`'s own
 * member-initiated `cancel`): every `booked` booking with `creditsUsed >
 * 0` is refunded in full, unconditionally — no `FREE_CANCELLATION_HOURS`/
 * `CORPORATE_FREE_CANCELLATION_HOURS` check. Those windows exist to
 * discourage a *member* from bailing late on their own choice; here the
 * *studio* cancelled the class, the member did nothing wrong, so there's
 * no late-notice behavior to discourage. `waitlisted` bookings always
 * have `creditsUsed: 0` (see BOOK-004/RESCH-002, both fixed) — refunding
 * them is therefore always a no-op, matching plan.md's own required
 * design ("Marks waitlisted entries cancelled without credit refunds").
 *
 * Returns `null` if the class doesn't exist — `classes.ts` turns that
 * into `NOT_FOUND`.
 */
export async function cancelClass(
  db: typeof import("@/db").db,
  classId: number,
): Promise<{ cls: typeof classes.$inferSelect; summary: ClassCancellationSummary } | null> {
  const cls = await db
    .update(classes)
    .set({ cancelled: true })
    .where(eq(classes.id, classId))
    .returning()
    .get();

  if (!cls) {
    return null;
  }

  // Cancel every still-active personal booking — booked AND waitlisted.
  // Previously only "booked" was touched, leaving anyone waitlisted for
  // this class stranded on a class that no longer exists.
  const cancelledBookings = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
    .where(
      and(eq(bookings.classId, classId), inArray(bookings.status, ["booked", "waitlisted"])),
    )
    .returning();

  // Same for corporate bookings — previously never touched at all.
  const cancelledCorporateBookings = await db
    .update(corporateBookings)
    .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
    .where(
      and(
        eq(corporateBookings.classId, classId),
        inArray(corporateBookings.status, ["booked", "waitlisted"]),
      ),
    )
    .returning();

  // Refund each cancelled personal booking that actually paid. Walk the
  // cancelled rows one at a time (not a bulk update) because each can
  // point at a different membership with its own balance.
  let creditsRefunded = 0;
  for (const b of cancelledBookings) {
    if (b.creditsUsed <= 0 || !b.membershipId) continue;

    const ms = await db.select().from(memberships).where(eq(memberships.id, b.membershipId)).get();
    // 999 matches bookings.ts's UNLIMITED_CREDITS threshold — an
    // unlimited plan was never actually decremented at booking time, so
    // there's nothing to refund back to it.
    if (ms && ms.creditsRemaining < 999) {
      await db
        .update(memberships)
        .set({ creditsRemaining: ms.creditsRemaining + b.creditsUsed })
        .where(eq(memberships.id, ms.id));
      creditsRefunded += b.creditsUsed;
    }
  }

  // Refund each cancelled corporate booking that actually paid. Company
  // credit pools have no "unlimited" concept, so every real charge
  // (creditsUsed > 0) is refunded once its company is found.
  let companyCreditsRefunded = 0;
  for (const b of cancelledCorporateBookings) {
    if (b.creditsUsed <= 0) continue;

    const company = await db.select().from(companies).where(eq(companies.id, b.companyId)).get();
    if (company) {
      await db
        .update(companies)
        .set({ creditPoolBalance: company.creditPoolBalance + b.creditsUsed })
        .where(eq(companies.id, company.id));
      companyCreditsRefunded += b.creditsUsed;
    }
  }

  // Notify every affected member — personal and corporate, booked and
  // waitlisted alike. NOTIF-003 (fixed earlier) only ever covered the
  // "booked personal" subset and explicitly deferred the rest here.
  const notifyUserIds = [
    ...cancelledBookings.map((b) => b.userId),
    ...cancelledCorporateBookings.map((b) => b.userId),
  ];
  if (notifyUserIds.length > 0) {
    await db.insert(notifications).values(
      notifyUserIds.map((userId) => ({
        userId,
        type: "class_cancelled" as const,
        title: "Class cancelled",
        message: `${cls.name} on ${cls.startsAt} has been cancelled.`,
      })),
    );
  }

  return {
    cls,
    summary: {
      cancelledBookings: cancelledBookings.length,
      cancelledCorporateBookings: cancelledCorporateBookings.length,
      creditsRefunded,
      companyCreditsRefunded,
    },
  };
}
