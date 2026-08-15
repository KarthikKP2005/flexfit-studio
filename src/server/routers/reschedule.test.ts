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
} from "@/db/schema";

/**
 * Characterization tests for reschedules.reschedule +
 * validateReschedule, written BEFORE the Phase 2.3 extraction into
 * src/features/reschedules/reschedule-policy.ts — locks in all four
 * credit-transition outcomes (RESCH-001/002), the equal-cost check
 * (RESCH-004), original-class waitlist promotion (RESCH-003), and that
 * validateReschedule's preview stays in sync with reschedule's real
 * decision, so the extraction can be verified byte-for-byte identical
 * per Rule 3.
 */
describe("reschedule / validateReschedule — pre-extraction characterization", () => {
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
      .values({ email: `m-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", name: "Member", role: "member" })
      .returning();
    const [plan] = await db
      .insert(membershipPlans)
      .values({ name: "Plan", priceCents: 1000, durationDays: 30, classCredits: 10 })
      .returning();
    const [ms] = await db
      .insert(memberships)
      .values({
        userId: member.id,
        planId: plan.id,
        startDate: todayIso(-1),
        endDate: todayIso(30),
        creditsRemaining,
        status: "active",
      })
      .returning();
    return { member, membership: ms };
  }

  async function seedClass(overrides: Partial<typeof classes.$inferInsert> = {}) {
    const [cls] = await db
      .insert(classes)
      .values({
        name: "Sunrise Yoga",
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

  it("confirmed -> confirmed: carries creditsUsed forward unchanged, target not full", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass();
    const toClass = await seedClass();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    const result = await caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id });
    expect(result.newStatus).toBe("booked");
    expect(result.newBooking.creditsUsed).toBe(2);

    const msAfter = await db.select().from(memberships).where(eq(memberships.id, membership.id));
    expect(msAfter[0]?.creditsRemaining).toBe(5); // unchanged — no new charge, no refund

    const orig = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(orig[0]?.status).toBe("cancelled");
  });

  it("RESCH-001: waitlisted -> confirmed charges the target's cost up front", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass();
    const toClass = await seedClass({ creditCost: 2 });
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "waitlisted", creditsUsed: 0 })
      .returning();

    const caller = createTestCaller(member);
    const result = await caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id });
    expect(result.newStatus).toBe("booked");
    expect(result.newBooking.creditsUsed).toBe(2);

    const msAfter = await db.select().from(memberships).where(eq(memberships.id, membership.id));
    expect(msAfter[0]?.creditsRemaining).toBe(3); // charged
  });

  it("RESCH-001: waitlisted -> confirmed rejects if insufficient credits", async () => {
    const { member, membership } = await seedMember(1);
    const fromClass = await seedClass();
    const toClass = await seedClass({ creditCost: 2 });
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "waitlisted", creditsUsed: 0 })
      .returning();

    const caller = createTestCaller(member);
    await expect(
      caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not enough class credits remaining." });
  });

  it("RESCH-002: confirmed -> waitlisted refunds the original charge", async () => {
    const { member, membership } = await seedMember(3);
    const fromClass = await seedClass();
    const other = await seedMember(5);
    const toClass = await seedClass({ capacity: 1, creditCost: 2 });
    // fill target class so the reschedule becomes waitlisted
    await db.insert(bookings).values({ classId: toClass.id, userId: other.member.id, status: "booked", creditsUsed: 2 });

    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    const result = await caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id });
    expect(result.newStatus).toBe("waitlisted");
    expect(result.newBooking.creditsUsed).toBe(0);

    const msAfter = await db.select().from(memberships).where(eq(memberships.id, membership.id));
    // Started at 3 (representing "5 total, 2 already spent on fromClass").
    // Refund brings it back to 5.
    expect(msAfter[0]?.creditsRemaining).toBe(5);
  });

  it("RESCH-003: cancelling a confirmed original promotes that class's own waitlist", async () => {
    const { member, membership } = await seedMember(5);
    const waiter = await seedMember(5);
    const fromClass = await seedClass({ capacity: 1 });
    const toClass = await seedClass();

    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();
    const [waiterBooking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: waiter.member.id, membershipId: waiter.membership.id, status: "waitlisted", creditsUsed: 0 })
      .returning();

    const caller = createTestCaller(member);
    await caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id });

    const waiterAfter = await db.select().from(bookings).where(eq(bookings.id, waiterBooking.id));
    expect(waiterAfter[0]?.status).toBe("booked"); // promoted
  });

  it("RESCH-004: rejects a target with a different credit cost", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass({ creditCost: 2 });
    const toClass = await seedClass({ creditCost: 3 });
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    await expect(
      caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "You can only reschedule to a class with the same credit cost." });
  });

  it("validateReschedule mirrors reschedule's rejection (same reason, no throw)", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass({ creditCost: 2 });
    const toClass = await seedClass({ creditCost: 3 });
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    const preview = await caller.reschedules.validateReschedule({ fromBookingId: booking.id, toClassId: toClass.id });
    expect(preview).toEqual({
      valid: false,
      reason: "You can only reschedule to a class with the same credit cost.",
    });
  });

  it("validateReschedule mirrors reschedule's success (valid: true, targetIsFull)", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass();
    const toClass = await seedClass();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    const preview = await caller.reschedules.validateReschedule({ fromBookingId: booking.id, toClassId: toClass.id });
    expect(preview).toEqual({ valid: true, targetIsFull: false });
  });

  it("rejects rescheduling outside the free-reschedule window", async () => {
    const { member, membership } = await seedMember(5);
    const fromClass = await seedClass({ startsAt: new Date(Date.now() + 60 * 60000).toISOString() }); // 1h out, window is 4h
    const toClass = await seedClass();
    const [booking] = await db
      .insert(bookings)
      .values({ classId: fromClass.id, userId: member.id, membershipId: membership.id, status: "booked", creditsUsed: 2 })
      .returning();

    const caller = createTestCaller(member);
    await expect(
      caller.reschedules.reschedule({ fromBookingId: booking.id, toClassId: toClass.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "You can only reschedule up to 4 hours before the class starts." });
  });
});
