import { db } from "@/db";
import { appRouter } from "@/server/routers/_app";
import type { User } from "@/db/schema";
import {
  checkins,
  reschedules,
  corporateBookings,
  bookings,
  companyMembers,
  payments,
  notifications,
  trainerAvailability,
  sessions,
  memberships,
  classes,
  companies,
  membershipPlans,
  users,
  studioSettings,
} from "@/db/schema";

/**
 * The whole test harness, deliberately kept to two functions — this repo
 * had a much larger `tests/setup/` design written up in
 * architecture-decisions.md that was never actually built (see that
 * file's 2026-08-15 correction entry). This is what Rule 6 actually
 * requires: a caller, and a way to reset state between tests. Nothing
 * else gets added here unless a specific test needs it.
 */

/**
 * Builds a real `appRouter` caller for the given user, bypassing
 * `createContext()`'s cookie lookup entirely — tests construct the
 * context directly since there's no real HTTP request to read a cookie
 * from. `db` here is always the disposable test database (vitest.config.ts
 * sets DB_FILE before this module — or any module — loads).
 */
export function createTestCaller(user: User | null) {
  return appRouter.createCaller({ db, user, token: undefined, ip: "test" });
}

/**
 * Deletes every row from every table, in FK-dependent order (children
 * before the parents they reference), so each test starts from a
 * genuinely empty database regardless of what a previous test left
 * behind. Call in `beforeEach`, not `beforeAll` — tests must not see
 * each other's rows.
 */
export async function resetDb() {
  await db.delete(checkins);
  await db.delete(reschedules);
  await db.delete(corporateBookings);
  await db.delete(bookings);
  await db.delete(companyMembers);
  await db.delete(payments);
  await db.delete(notifications);
  await db.delete(trainerAvailability);
  await db.delete(sessions);
  await db.delete(memberships);
  await db.delete(classes);
  await db.delete(companies);
  await db.delete(membershipPlans);
  await db.delete(users);
  await db.delete(studioSettings);
}
