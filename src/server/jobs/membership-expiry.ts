import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users, membershipPlans, notifications } from "@/db/schema";

/**
 * Background job for NOTIF-004 (membership_expiring notifications).
 * Not responsible for: deciding *when* to run — see server/cron.ts (the
 * standalone daily-schedule process) and admin.ts's
 * `runMembershipExpiryCheck` (the manual trigger) — both call the one
 * function here so the "expiring soon" definition and notification
 * content never drift between the two entry points.
 */

/** Membership window (days) — matches admin.ts's expiringMemberships report exactly. */
const EXPIRY_WINDOW_DAYS = 14;

/**
 * Finds active memberships whose endDate falls within
 * EXPIRY_WINDOW_DAYS and inserts one `membership_expiring` notification
 * per member.
 *
 * Chosen policy (NOTIF-004 — no scheduled-job mechanism existed in this
 * app before this fix, so this behavior was designed, not discovered):
 * a membership sitting inside the 14-day window gets one notification
 * per *run*, not one ever — deduplication is achieved by running this
 * once a day (see instrumentation.ts's cron schedule), not by tracking
 * "already notified" state, since notifications has no membershipId
 * column and adding one would be a schema change (Rule 1.2) out of
 * scope here. Calling this manually more than once on the same day (via
 * admin.ts's runMembershipExpiryCheck) will send duplicate reminders —
 * an accepted tradeoff of the manual trigger, not a bug in the schedule.
 */
export async function notifyExpiringMemberships(): Promise<{ notified: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const expiring = await db
    .select({
      userId: users.id,
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
        lte(memberships.endDate, windowEnd),
      ),
    );

  if (expiring.length === 0) {
    return { notified: 0 };
  }

  await db.insert(notifications).values(
    expiring.map((m) => ({
      userId: m.userId,
      type: "membership_expiring" as const,
      title: "Membership expiring soon",
      message: `Your ${m.planName} membership expires on ${m.expiresAt}.`,
    })),
  );

  return { notified: expiring.length };
}
