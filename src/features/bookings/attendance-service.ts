import { studioSettings } from "@/db/schema";
import { TRPCError } from "@trpc/server";

/**
 * Shared check-in policy for both personal (`bookings.markAttended`) and
 * corporate (`corporateBookings.markAttended`) attendance — the two
 * mutations were near-identical copies of this exact validation before
 * this extraction (Phase 2 item 1 of restructure-plan.md). Not
 * responsible for: the actual DB writes (updating the booking's status,
 * inserting the `checkins` row) — those stay in each router since the
 * two check-in paths write to different tables and, notably, build the
 * `checkins` insert differently (corporate never passes `source`, so it
 * always lands on the column default `"front_desk"` regardless of the
 * real source — a pre-existing quirk this extraction preserves exactly,
 * not silently fixes; see attendance.test.ts).
 */

/**
 * @throws BAD_REQUEST if the booking isn't currently "booked"
 */
export function assertBookingCheckable(status: string): void {
  if (status !== "booked") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only confirmed bookings can be checked in.",
    });
  }
}

/**
 * Reads the studio's configured check-in window (minutes before class
 * start that check-in opens), falling back to 30 if no settings row
 * exists — identical fallback both routers used inline before this.
 */
export async function getCheckinWindowMinutes(db: typeof import("@/db").db): Promise<number> {
  const settingsRow = await db.select().from(studioSettings).limit(1).get();
  return settingsRow?.checkinWindowMinutes ?? 30;
}

/**
 * @throws BAD_REQUEST if `now` is outside [class start - windowMinutes, class end]
 */
export function assertCheckInWindow(
  cls: { startsAt: string; durationMin: number },
  windowMinutes: number,
  now = new Date(),
): void {
  const nowMs = now.getTime();
  const startMs = new Date(cls.startsAt).getTime();
  const endMs = startMs + cls.durationMin * 60000;
  if (nowMs < startMs - windowMinutes * 60000 || nowMs > endMs) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Check-in is only allowed from ${windowMinutes} minutes before class starts until it ends.`,
    });
  }
}
