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
 * Also fixes CORP-001 and BOOK-004 — a candidate's credit (company pool
 * or personal membership) is now verified BEFORE promoting, not after,
 * on both sides (see `promoteNextWaitlisted`).
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
 * A candidate is only eligible if their credit source can currently
 * afford the class — a personal member's membership (BOOK-004, fixed)
 * or a corporate member's company credit pool (CORP-001, fixed); if not,
 * they are skipped (left waitlisted, not promoted for free) and the
 * next-oldest remaining candidate is tried instead, from EITHER source
 * — plan.md's "skip and check the next candidate" policy, chosen
 * explicitly per Rule 8 for both defects (leaving an ineligible
 * candidate waitlisted at the front of the queue would block every
 * eligible person behind them, personal or corporate, which is worse
 * than today's bug, not better).
 *
 * Does nothing if neither waitlist has a candidate, or if every
 * candidate found turns out to be ineligible. Call only after confirming
 * a `booked` row on `cls.id` was just cancelled — this does not itself
 * verify a seat was freed.
 *
 * Not wrapped in a transaction — the check-then-write race this shares
 * with every other booking flow in this app is a separate, broader,
 * already-documented gap (plan.md's "no transactions" findings), not
 * made worse by this fix.
 */
export async function promoteNextWaitlisted(
  db: typeof import("@/db").db | any, // CHANGED: Accept `tx` (transaction) or global `db` to prevent race conditions during promotions
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
    ...personalCandidates.map((row: PersonalCandidate): Candidate => ({ source: "personal", row })),
    ...corporateCandidates.map((row: CorporateCandidate): Candidate => ({ source: "corporate", row })),
  ].sort((a, b) => (a.row.bookedAt < b.row.bookedAt ? -1 : a.row.bookedAt > b.row.bookedAt ? 1 : 0));

  for (const candidate of queue) {
    const promoted =
      candidate.source === "personal"
        ? await tryPromotePersonalCandidate(db, candidate.row, cls)
        : await tryPromoteCorporateCandidate(db, candidate.row, cls);

    if (promoted) {
      return;
    }
    // Ineligible (insufficient membership credit or company credit):
    // candidate.row stays waitlisted, loop continues to the next-oldest
    // remaining candidate from either source.
  }
}

/**
 * Personal promotion mechanics (BOOK-004, fixed): verifies the
 * membership can actually afford the class BEFORE promoting — the old
 * behavior promoted unconditionally and floored the balance at zero with
 * `Math.max` instead of validating eligibility. Once eligibility is
 * confirmed up front, a plain subtraction can never go negative, so that
 * floor is gone too — it was never a correctness fix, just a symptom of
 * the missing check. Returns false without changing anything if the
 * membership can't currently afford the class, so the caller can move on
 * to the next candidate; returns true once this candidate has been
 * promoted and deducted.
 *
 * A booking with no `membershipId`, or one whose referenced membership
 * row can no longer be found, is treated as eligible — matching the
 * original code, which never blocked promotion on either condition
 * either; changing that is outside BOOK-004's scope.
 */
async function tryPromotePersonalCandidate(
  db: typeof import("@/db").db | any, // CHANGED: Accept `tx` (transaction)
  candidate: PersonalCandidate,
  cls: PromotionClass,
): Promise<boolean> {
  let ms: typeof memberships.$inferSelect | undefined;

  if (candidate.membershipId) {
    ms = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, candidate.membershipId))
      .get();

    // 999 matches bookings.ts's UNLIMITED_CREDITS threshold — unlimited
    // plans are always eligible.
    if (ms && ms.creditsRemaining < 999 && ms.creditsRemaining < cls.creditCost) {
      return false;
    }
  }

  await db
    .update(bookings)
    .set({ status: "booked", creditsUsed: cls.creditCost })
    .where(eq(bookings.id, candidate.id));

  if (ms && ms.creditsRemaining < 999) {
    await db
      .update(memberships)
      .set({ creditsRemaining: ms.creditsRemaining - cls.creditCost })
      .where(eq(memberships.id, ms.id));
  }

  await db.insert(notifications).values({
    userId: candidate.userId,
    type: "waitlist_promotion",
    title: "You're off the waitlist!",
    message: `You've been booked into ${cls.name} on ${cls.startsAt}.`,
  });

  return true;
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
  db: typeof import("@/db").db | any, // CHANGED: Accept `tx` (transaction)
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
