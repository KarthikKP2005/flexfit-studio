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
 * Also fixes CORP-001 — a corporate candidate's company credit is now
 * verified BEFORE promoting, not after (see `promoteNextWaitlisted`).
 * Not responsible for: BOOK-004 — a personal candidate is still promoted
 * unconditionally, with no credit recheck, exactly as before.
 */

/** Fields `promoteNextWaitlisted` needs from the class a seat just freed on. */
type PromotionClass = {
  id: number;
  name: string;
  startsAt: string;
  creditCost: number;
};

type PersonalCandidate = typeof bookings.$inferSelect;
type CorporateCandidate = typeof corporateBookings.$inferSelect;

type Candidate =
  | { source: "personal"; row: PersonalCandidate }
  | { source: "corporate"; row: CorporateCandidate };

/**
 * Promotes the single oldest ELIGIBLE waitlisted candidate for `cls`,
 * comparing `bookedAt` across both waitlists together (CORP-003, fixed).
 * A personal candidate is always eligible (BOOK-004 — no credit recheck,
 * unchanged). A corporate candidate is only eligible if their company can
 * currently afford the class; if not, they are skipped (left waitlisted,
 * not promoted for free) and the next-oldest remaining candidate is
 * tried instead — CORP-001, fixed, using plan.md's "skip and check the
 * next candidate" policy (chosen explicitly per Rule 8: leaving an
 * ineligible candidate waitlisted at the front of the queue would block
 * every eligible person behind them, which is worse than today's bug,
 * not better).
 *
 * Does nothing if neither waitlist has a candidate, or if every
 * candidate found is an ineligible corporate one. Call only after
 * confirming a `booked` row on `cls.id` was just cancelled — this does
 * not itself verify a seat was freed.
 *
 * Not wrapped in a transaction — the check-then-write race this shares
 * with every other booking flow in this app is a separate, broader,
 * already-documented gap (plan.md's "no transactions" findings), not
 * made worse by this fix.
 */
export async function promoteNextWaitlisted(
  db: typeof import("@/db").db,
  cls: PromotionClass,
): Promise<void> {
  const personalCandidates = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.classId, cls.id), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.bookedAt));

  const corporateCandidates = await db
    .select()
    .from(corporateBookings)
    .where(
      and(eq(corporateBookings.classId, cls.id), eq(corporateBookings.status, "waitlisted")),
    )
    .orderBy(asc(corporateBookings.bookedAt));

  // One chronological queue across both sources — the single fair order
  // CORP-003 established. Walked oldest-first below; a skipped corporate
  // candidate just falls through to the next entry, not a separate table.
  const queue: Candidate[] = [
    ...personalCandidates.map((row): Candidate => ({ source: "personal", row })),
    ...corporateCandidates.map((row): Candidate => ({ source: "corporate", row })),
  ].sort((a, b) => (a.row.bookedAt < b.row.bookedAt ? -1 : a.row.bookedAt > b.row.bookedAt ? 1 : 0));

  for (const candidate of queue) {
    if (candidate.source === "personal") {
      await promotePersonalCandidate(db, candidate.row, cls);
      return;
    }

    const promoted = await tryPromoteCorporateCandidate(db, candidate.row, cls);
    if (promoted) {
      return;
    }
    // Insufficient company credit: candidate.row stays waitlisted, loop
    // continues to the next-oldest remaining candidate.
  }
}

/**
 * Personal promotion mechanics — unchanged from bookings.ts's cancel
 * (see BOOK-004: no credit recheck before promoting, floors the
 * membership's balance at zero with Math.max instead of rejecting).
 */
async function promotePersonalCandidate(
  db: typeof import("@/db").db,
  candidate: PersonalCandidate,
  cls: PromotionClass,
): Promise<void> {
  await db
    .update(bookings)
    .set({ status: "booked", creditsUsed: cls.creditCost })
    .where(eq(bookings.id, candidate.id));

  if (candidate.membershipId) {
    const ms = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, candidate.membershipId))
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
    userId: candidate.userId,
    type: "waitlist_promotion",
    title: "You're off the waitlist!",
    message: `You've been booked into ${cls.name} on ${cls.startsAt}.`,
  });
}

/**
 * Corporate promotion mechanics (CORP-001, fixed): loads the company and
 * verifies its credit pool BEFORE promoting — the old order (promote
 * first, check after) is gone. Returns false without changing anything
 * if the company can't currently afford the class, so the caller can
 * move on to the next candidate; returns true once this candidate has
 * been promoted and deducted.
 */
async function tryPromoteCorporateCandidate(
  db: typeof import("@/db").db,
  candidate: CorporateCandidate,
  cls: PromotionClass,
): Promise<boolean> {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, candidate.companyId))
    .get();

  if (!company || company.creditPoolBalance < cls.creditCost) {
    return false;
  }

  await db
    .update(companies)
    .set({ creditPoolBalance: company.creditPoolBalance - cls.creditCost })
    .where(eq(companies.id, company.id));

  await db
    .update(corporateBookings)
    .set({ status: "booked", creditsUsed: cls.creditCost })
    .where(eq(corporateBookings.id, candidate.id));

  await db.insert(notifications).values({
    userId: candidate.userId,
    type: "waitlist_promotion",
    title: "You're off the waitlist!",
    message: `You've been booked into ${cls.name} on ${cls.startsAt}.`,
  });

  return true;
}
