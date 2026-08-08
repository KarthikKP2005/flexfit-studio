import { and, desc, eq, sql } from "drizzle-orm";
import { memberships } from "@/db/schema";

/**
 * Shared resolution of "which membership should this user book/pay
 * against right now" — used by bookings.ts (MEMBER-002, fixed: this
 * used to be a private copy inside bookings.ts; members.ts's `profile`
 * had its own, looser query and could disagree with it about which
 * membership was current). Not responsible for: what a member's plan
 * catalog/subscription looks like (plans.ts) or membership history
 * display (members.ts's `byId`, which intentionally returns every row,
 * not just the current one).
 */

/**
 * The membership `userId` should book/pay against right now: status
 * "active" and endDate >= today, most-distant endDate first if somehow
 * more than one qualifies (see PLAN-001 in known-issues.md — subscribe
 * now rejects a second active membership, so this tiebreak shouldn't be
 * reachable for new data, but existing rows created before that fix
 * could still collide).
 *
 * Does not check startDate — a membership with a future startDate is
 * still treated as usable today (plan.md item #21, not yet tracked as
 * its own known-issues.md entry; carried forward unchanged from the
 * pre-extraction behavior in bookings.ts, not fixed as part of this
 * change).
 */
export async function getCurrentMembership(
  db: typeof import("@/db").db,
  userId: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}
