import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { createTestCaller, resetDb } from "@/tests/setup";
import { users, classes, trainerAvailability } from "@/db/schema";

/**
 * Real, committed characterization/regression tests for
 * adminClasses.swapTrainer — first file written against the minimal
 * harness built in documents/restructure-plan.md's Phase 0. Covers
 * TRAINER-003 (swapTrainer now checks the new trainer's availability
 * before reassigning) at the tRPC-caller level, per Rule 6.
 */
describe("adminClasses.swapTrainer", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedAdminAndTrainers() {
    const [admin] = await db
      .insert(users)
      .values({
        email: "admin@test.local",
        passwordHash: "x",
        name: "Admin",
        role: "admin",
      })
      .returning();

    const [oldTrainer] = await db
      .insert(users)
      .values({
        email: "old-trainer@test.local",
        passwordHash: "x",
        name: "Old Trainer",
        role: "trainer",
      })
      .returning();

    const [availableTrainer] = await db
      .insert(users)
      .values({
        email: "available-trainer@test.local",
        passwordHash: "x",
        name: "Available Trainer",
        role: "trainer",
      })
      .returning();

    const [unavailableTrainer] = await db
      .insert(users)
      .values({
        email: "unavailable-trainer@test.local",
        passwordHash: "x",
        name: "Unavailable Trainer",
        role: "trainer",
      })
      .returning();

    return { admin, oldTrainer, availableTrainer, unavailableTrainer };
  }

  it("TRAINER-003: rejects swapping to a trainer with no availability set for that day", async () => {
    const { admin, oldTrainer, unavailableTrainer } = await seedAdminAndTrainers();

    // Saturday, 02:00 UTC — a day/time unavailableTrainer has zero
    // trainerAvailability rows for (none inserted at all).
    const startsAt = nextUtcDayAt(6, 2, 0);

    const [cls] = await db
      .insert(classes)
      .values({
        name: "Test Class",
        trainerId: oldTrainer.id,
        room: "Room 1",
        capacity: 10,
        startsAt,
        durationMin: 60,
        creditCost: 1,
        cancelled: false,
      })
      .returning();

    const caller = createTestCaller(admin);

    await expect(
      caller.adminClasses.swapTrainer({ classId: cls.id, newTrainerId: unavailableTrainer.id }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "No availability set for this day.",
    });

    const after = await db.select().from(classes).where(eq(classes.id, cls.id));
    expect(after[0]?.trainerId).toBe(oldTrainer.id); // unchanged
  });

  it("swaps successfully when the new trainer is available at the class's time", async () => {
    const { admin, oldTrainer, availableTrainer } = await seedAdminAndTrainers();

    const startsAt = nextUtcDayAt(6, 10, 0); // Saturday, 10:00 UTC

    await db.insert(trainerAvailability).values({
      trainerId: availableTrainer.id,
      dayOfWeek: 6,
      startTime: "08:00",
      endTime: "18:00",
    });

    const [cls] = await db
      .insert(classes)
      .values({
        name: "Test Class",
        trainerId: oldTrainer.id,
        room: "Room 1",
        capacity: 10,
        startsAt,
        durationMin: 60,
        creditCost: 1,
        cancelled: false,
      })
      .returning();

    const caller = createTestCaller(admin);
    const result = await caller.adminClasses.swapTrainer({
      classId: cls.id,
      newTrainerId: availableTrainer.id,
    });

    expect(result).toEqual({ ok: true });

    const after = await db.select().from(classes).where(eq(classes.id, cls.id));
    expect(after[0]?.trainerId).toBe(availableTrainer.id);
  });

  it("throws NOT_FOUND for a nonexistent class id", async () => {
    const { admin, availableTrainer } = await seedAdminAndTrainers();
    const caller = createTestCaller(admin);

    await expect(
      caller.adminClasses.swapTrainer({ classId: 999999, newTrainerId: availableTrainer.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Class not found." });
  });
});

// Small local helper — no shared fixtures file, per Phase 0's
// "minimal, no ceremony" scope.
function nextUtcDayAt(targetDayOfWeek: number, hourUtc: number, minuteUtc: number): string {
  const now = new Date();
  const daysUntil = (targetDayOfWeek - now.getUTCDay() + 7) % 7 || 7;
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, hourUtc, minuteUtc, 0),
  );
  return target.toISOString();
}
