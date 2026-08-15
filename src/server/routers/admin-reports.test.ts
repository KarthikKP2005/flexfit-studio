import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { createTestCaller, resetDb } from "@/tests/setup";
import { users, classes, bookings, payments, checkins } from "@/db/schema";

/**
 * Characterization tests for admin.classUtilisation, revenueByMonth,
 * revenueByMethod, checkinsPerDay, topTrainers, and noShowList — written
 * BEFORE the Phase 2.4 extraction into src/features/reports/ and
 * src/features/attendance/, so the extraction can be verified
 * byte-for-byte identical per Rule 3. Does not cover admin.ts's other
 * procedures (stats, trainerPayroll, settings, updateSettings,
 * runMembershipExpiryCheck, expiringMemberships, refundCount) — those
 * stay inline in admin.ts, out of scope for this extraction (see
 * restructure-plan.md Phase 2 item 4's stated scope: "utilisation
 * reporting, revenue reporting, attendance/no-show" only).
 */
describe("admin reports/attendance procedures — pre-extraction characterization", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedAdmin() {
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name: "Admin", role: "admin" })
      .returning();
    return admin;
  }

  async function seedTrainer(name = "Trainer One") {
    const [trainer] = await db
      .insert(users)
      .values({ email: `trainer-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name, role: "trainer" })
      .returning();
    return trainer;
  }

  async function seedMember() {
    const [member] = await db
      .insert(users)
      .values({ email: `member-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name: "Member", role: "member" })
      .returning();
    return member;
  }

  it("classUtilisation: ADMIN-003 — booked count is always 0, regardless of real bookings (correlated-subquery-as-column bug)", async () => {
    const admin = await seedAdmin();
    const trainer = await seedTrainer();
    const member1 = await seedMember();
    const member2 = await seedMember();
    const [cls] = await db
      .insert(classes)
      .values({ name: "Class A", trainerId: trainer.id, room: "R1", capacity: 4, startsAt: new Date().toISOString(), durationMin: 60, creditCost: 1, cancelled: false })
      .returning();
    await db.insert(bookings).values([
      { classId: cls.id, userId: member1.id, status: "booked", creditsUsed: 1 },
      { classId: cls.id, userId: member2.id, status: "attended", creditsUsed: 1 },
    ]);

    const caller = createTestCaller(admin);
    const result = await caller.admin.classUtilisation({ limit: 10 });
    const row = result.find((r) => r.id === cls.id);
    // NOT a typo, NOT a test bug — this is the actual, current, buggy
    // behavior. Two real bookings exist for this class (confirmed via a
    // direct query in the same debugging session that found this), but
    // the correlated-subquery-as-select-column query shape drizzle-orm
    // compiles here always returns 0. See ADMIN-003 in known-issues.md.
    expect(row?.booked).toBe(0);
    expect(row?.utilisation).toBe(0);
  });

  it("revenueByMonth: sums paid payments grouped by month", async () => {
    const admin = await seedAdmin();
    const member = await seedMember();
    const now = new Date().toISOString();
    await db.insert(payments).values([
      { userId: member.id, amountCents: 1000, method: "card", status: "paid", createdAt: now },
      { userId: member.id, amountCents: 500, method: "cash", status: "paid", createdAt: now },
      { userId: member.id, amountCents: 9999, method: "card", status: "pending", createdAt: now }, // excluded
    ]);

    const caller = createTestCaller(admin);
    const result = await caller.admin.revenueByMonth();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const row = result.find((r) => r.month === thisMonth);
    expect(row?.totalCents).toBe(1500);
  });

  it("revenueByMethod: sums paid payments grouped by method, ordered highest first", async () => {
    const admin = await seedAdmin();
    const member = await seedMember();
    await db.insert(payments).values([
      { userId: member.id, amountCents: 1000, method: "card", status: "paid" },
      { userId: member.id, amountCents: 3000, method: "upi", status: "paid" },
      { userId: member.id, amountCents: 500, method: "cash", status: "failed" }, // excluded
    ]);

    const caller = createTestCaller(admin);
    const result = await caller.admin.revenueByMethod();
    expect(result[0]).toMatchObject({ method: "upi", totalCents: 3000, count: 1 });
    expect(result.find((r) => r.method === "card")).toMatchObject({ totalCents: 1000, count: 1 });
    expect(result.find((r) => r.method === "cash")).toBeUndefined();
  });

  it("checkinsPerDay: groups checkins by date, last 14 days only", async () => {
    const admin = await seedAdmin();
    const member = await seedMember();
    const today = new Date().toISOString();
    const tooOld = new Date(Date.now() - 20 * 24 * 3600000).toISOString();
    await db.insert(checkins).values([
      { userId: member.id, source: "kiosk", checkedInAt: today },
      { userId: member.id, source: "kiosk", checkedInAt: today },
      { userId: member.id, source: "kiosk", checkedInAt: tooOld },
    ]);

    const caller = createTestCaller(admin);
    const result = await caller.admin.checkinsPerDay();
    const todayStr = today.slice(0, 10);
    const row = result.find((r) => r.date === todayStr);
    expect(row?.count).toBe(2);
    expect(result.find((r) => r.date === tooOld.slice(0, 10))).toBeUndefined();
  });

  it("topTrainers: counts attended bookings per trainer, last 14 days", async () => {
    const admin = await seedAdmin();
    const trainer = await seedTrainer("Star Trainer");
    const member = await seedMember();
    const [cls] = await db
      .insert(classes)
      .values({ name: "Class A", trainerId: trainer.id, room: "R1", capacity: 10, startsAt: new Date().toISOString(), durationMin: 60, creditCost: 1, cancelled: false })
      .returning();
    await db.insert(bookings).values({ classId: cls.id, userId: member.id, status: "attended", creditsUsed: 1 });

    const caller = createTestCaller(admin);
    const result = await caller.admin.topTrainers();
    const row = result.find((r) => r.trainerId === trainer.id);
    expect(row?.trainerName).toBe("Star Trainer");
    expect(row?.attendedCount).toBe(1);
  });

  it("noShowList: returns no_show bookings with trainer name resolved", async () => {
    const admin = await seedAdmin();
    const trainer = await seedTrainer("No Show Trainer");
    const member = await seedMember();
    const [cls] = await db
      .insert(classes)
      .values({ name: "Class A", trainerId: trainer.id, room: "R1", capacity: 10, startsAt: new Date().toISOString(), durationMin: 60, creditCost: 1, cancelled: false })
      .returning();
    await db.insert(bookings).values({ classId: cls.id, userId: member.id, status: "no_show", creditsUsed: 1 });

    const caller = createTestCaller(admin);
    const result = await caller.admin.noShowList();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ trainerName: "No Show Trainer" });
  });
});
