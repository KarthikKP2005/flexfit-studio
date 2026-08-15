import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { createTestCaller, resetDb } from "@/tests/setup";
import {
  users,
  classes,
  membershipPlans,
  memberships,
  bookings,
  companies,
  companyMembers,
  corporateBookings,
} from "@/db/schema";

/**
 * Characterization tests for bookings.book and corporateBookings.book,
 * written BEFORE the Phase 2.2 extraction into
 * src/features/bookings/booking-policy.ts — locks in the shared
 * class-validity and duplicate-booking checks so the extraction can be
 * verified byte-for-byte identical per Rule 3.
 */
describe("book (personal + corporate) — pre-extraction characterization", () => {
  beforeEach(async () => {
    await resetDb();
  });

  function todayIso(offsetDays = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  async function seedMember(creditsRemaining = 5) {
    const [member] = await db
      .insert(users)
      .values({ email: `member-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name: "Member", role: "member" })
      .returning();
    const [plan] = await db
      .insert(membershipPlans)
      .values({ name: "Test Plan", priceCents: 1000, durationDays: 30, classCredits: 10 })
      .returning();
    await db.insert(memberships).values({
      userId: member.id,
      planId: plan.id,
      startDate: todayIso(-1),
      endDate: todayIso(30),
      creditsRemaining,
      status: "active",
    });
    return member;
  }

  async function seedCorpMember(creditPoolBalance = 50) {
    const [member] = await db
      .insert(users)
      .values({ email: `corp-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name: "Corp Member", role: "member" })
      .returning();
    const [company] = await db
      .insert(companies)
      .values({ name: "TestCo", contactEmail: "hr@testco.local", creditPoolBalance, active: true })
      .returning();
    await db.insert(companyMembers).values({ userId: member.id, companyId: company.id });
    return { member, company };
  }

  async function seedClass(overrides: Partial<typeof classes.$inferInsert> = {}) {
    const [cls] = await db
      .insert(classes)
      .values({
        name: "Test Class",
        room: "Room 1",
        capacity: 10,
        startsAt: new Date(Date.now() + 24 * 3600000).toISOString(),
        durationMin: 60,
        creditCost: 2,
        cancelled: false,
        ...overrides,
      })
      .returning();
    return cls;
  }

  it("personal: books successfully, deducts credits", async () => {
    const member = await seedMember(5);
    const cls = await seedClass();
    const caller = createTestCaller(member);

    const result = await caller.bookings.book({ classId: cls.id });
    expect(result.status).toBe("booked");
    expect(result.creditsUsed).toBe(2);

    const ms = await db.select().from(memberships).where(eq(memberships.userId, member.id));
    expect(ms[0]?.creditsRemaining).toBe(3);
  });

  it("personal: rejects a cancelled class", async () => {
    const member = await seedMember(5);
    const cls = await seedClass({ cancelled: true });
    const caller = createTestCaller(member);

    await expect(caller.bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    });
  });

  it("personal: rejects a class that has already started", async () => {
    const member = await seedMember(5);
    const cls = await seedClass({ startsAt: new Date(Date.now() - 3600000).toISOString() });
    const caller = createTestCaller(member);

    await expect(caller.bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This class has already started.",
    });
  });

  it("personal: rejects a duplicate active booking", async () => {
    const member = await seedMember(5);
    const cls = await seedClass();
    const caller = createTestCaller(member);

    await caller.bookings.book({ classId: cls.id });
    await expect(caller.bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You are already on the list for this class.",
    });
  });

  it("personal: waitlists when the class is full", async () => {
    const member = await seedMember(5);
    const other = await seedMember(5);
    const cls = await seedClass({ capacity: 1 });
    await db.insert(bookings).values({ classId: cls.id, userId: other.id, status: "booked", creditsUsed: 2 });

    const caller = createTestCaller(member);
    const result = await caller.bookings.book({ classId: cls.id });
    expect(result.status).toBe("waitlisted");
    expect(result.creditsUsed).toBe(0);
  });

  it("corporate: books successfully, deducts company credit pool", async () => {
    const { member, company } = await seedCorpMember(50);
    const cls = await seedClass();
    const caller = createTestCaller(member);

    const result = await caller.corporateBookings.book({ classId: cls.id });
    expect(result.status).toBe("booked");

    const companyAfter = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(companyAfter[0]?.creditPoolBalance).toBe(48);
  });

  it("corporate: rejects a cancelled class", async () => {
    const { member } = await seedCorpMember(50);
    const cls = await seedClass({ cancelled: true });
    const caller = createTestCaller(member);

    await expect(caller.corporateBookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    });
  });

  it("corporate: rejects a duplicate active booking", async () => {
    const { member } = await seedCorpMember(50);
    const cls = await seedClass();
    const caller = createTestCaller(member);

    await caller.corporateBookings.book({ classId: cls.id });
    await expect(caller.corporateBookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You are already on the list for this class.",
    });
  });

  it("corporate: waitlists when the class is full", async () => {
    const { member } = await seedCorpMember(50);
    const other = await seedMember(5);
    const cls = await seedClass({ capacity: 1 });
    await db.insert(bookings).values({ classId: cls.id, userId: other.id, status: "booked", creditsUsed: 2 });

    const caller = createTestCaller(member);
    const result = await caller.corporateBookings.book({ classId: cls.id });
    expect(result.status).toBe("waitlisted");
  });
});
