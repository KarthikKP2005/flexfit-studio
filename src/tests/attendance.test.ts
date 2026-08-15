import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { createTestCaller, resetDb } from "@/tests/setup";
import { users, classes, bookings, corporateBookings, companies, checkins } from "@/db/schema";

/**
 * Characterization tests for markAttended (personal + corporate),
 * written BEFORE the Phase 2.1 extraction into
 * src/features/bookings/attendance-service.ts — captures current
 * behavior, quirks included, so the extraction can be verified
 * byte-for-byte identical per Rule 3.
 *
 * Notably: corporate's checkins insert never passes `source`, so it
 * always lands on the column default ("front_desk") regardless of the
 * actual source (kiosk/trainer/app) — a real, previously-undocumented
 * inconsistency with the personal path, which does record the real
 * source. This test locks that exact behavior in; the extraction must
 * not silently fix it.
 */
describe("markAttended (personal + corporate) — pre-extraction characterization", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seed() {
    const [staff] = await db
      .insert(users)
      .values({ email: "staff@test.local", passwordHash: "x", name: "Staff", role: "admin" })
      .returning();
    const [member] = await db
      .insert(users)
      .values({ email: "member@test.local", passwordHash: "x", name: "Member", role: "member" })
      .returning();
    const [corpMember] = await db
      .insert(users)
      .values({ email: "corp-member@test.local", passwordHash: "x", name: "Corp Member", role: "member" })
      .returning();
    const [company] = await db
      .insert(companies)
      .values({ name: "TestCo", contactEmail: "hr@testco.local", creditPoolBalance: 100 })
      .returning();

    // Class currently in progress (started 10 min ago, 60 min long) —
    // inside the default 30-min-before-to-end check-in window.
    const startsAt = new Date(Date.now() - 10 * 60000).toISOString();
    const [cls] = await db
      .insert(classes)
      .values({
        name: "Test Class",
        room: "Room 1",
        capacity: 10,
        startsAt,
        durationMin: 60,
        creditCost: 1,
        cancelled: false,
      })
      .returning();

    return { staff, member, corpMember, company, cls };
  }

  it("personal: marks attended, records the real source in checkins", async () => {
    const { staff, member, cls } = await seed();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: cls.id, userId: member.id, status: "booked", creditsUsed: 1 })
      .returning();

    const caller = createTestCaller(staff);
    const result = await caller.bookings.markAttended({ bookingId: booking.id, source: "kiosk" });
    expect(result).toEqual({ ok: true });

    const after = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after[0]?.status).toBe("attended");

    const checkinRows = await db.select().from(checkins).where(eq(checkins.userId, member.id));
    expect(checkinRows).toHaveLength(1);
    expect(checkinRows[0]?.bookingId).toBe(booking.id);
    expect(checkinRows[0]?.source).toBe("kiosk"); // real source recorded
  });

  it("personal: rejects a booking that isn't currently booked", async () => {
    const { staff, member, cls } = await seed();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: cls.id, userId: member.id, status: "cancelled", creditsUsed: 0 })
      .returning();

    const caller = createTestCaller(staff);
    await expect(
      caller.bookings.markAttended({ bookingId: booking.id, source: "kiosk" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only confirmed bookings can be checked in." });
  });

  it("corporate: marks attended, checkins.bookingId is null, source is ALWAYS front_desk regardless of input (CORP-004-adjacent quirk)", async () => {
    const { staff, corpMember, company, cls } = await seed();
    const [booking] = await db
      .insert(corporateBookings)
      .values({ classId: cls.id, userId: corpMember.id, companyId: company.id, status: "booked", creditsUsed: 1 })
      .returning();

    const caller = createTestCaller(staff);
    // Explicitly pass "trainer" as the source — the quirk is that this
    // gets silently dropped and the DB column default wins instead.
    const result = await caller.corporateBookings.markAttended({ bookingId: booking.id, source: "trainer" });
    expect(result).toEqual({ ok: true });

    const after = await db.select().from(corporateBookings).where(eq(corporateBookings.id, booking.id));
    expect(after[0]?.status).toBe("attended");

    const checkinRows = await db.select().from(checkins).where(eq(checkins.userId, corpMember.id));
    expect(checkinRows).toHaveLength(1);
    expect(checkinRows[0]?.bookingId).toBeNull();
    expect(checkinRows[0]?.source).toBe("front_desk"); // NOT "trainer" — the quirk
  });

  it("corporate: rejects a booking that isn't currently booked", async () => {
    const { staff, corpMember, company, cls } = await seed();
    const [booking] = await db
      .insert(corporateBookings)
      .values({ classId: cls.id, userId: corpMember.id, companyId: company.id, status: "waitlisted", creditsUsed: 0 })
      .returning();

    const caller = createTestCaller(staff);
    await expect(
      caller.corporateBookings.markAttended({ bookingId: booking.id, source: "kiosk" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only confirmed bookings can be checked in." });
  });

  it("both: reject check-in outside the window (class hasn't started yet, more than 30 min out)", async () => {
    const { staff, member } = await seed();
    const futureStart = new Date(Date.now() + 2 * 60 * 60000).toISOString(); // 2h from now
    const [cls] = await db
      .insert(classes)
      .values({
        name: "Future Class",
        room: "Room 1",
        capacity: 10,
        startsAt: futureStart,
        durationMin: 60,
        creditCost: 1,
        cancelled: false,
      })
      .returning();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: cls.id, userId: member.id, status: "booked", creditsUsed: 1 })
      .returning();

    const caller = createTestCaller(staff);
    await expect(
      caller.bookings.markAttended({ bookingId: booking.id, source: "kiosk" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
