import { and, eq } from "drizzle-orm";
import { trainerAvailability, classes } from "@/db/schema";

/**
 * Validates if a trainer is available to take a class at a specific time.
 * This checks both their weekly schedule bounds and ensures they aren't
 * double-booked with another active class.
 */
export async function isTrainerAvailable(
  db: typeof import("@/db").db | any,
  trainerId: number,
  startsAt: string,
  durationMin: number,
  excludeClassId?: number // Useful for updates so we don't conflict with the class itself
): Promise<{ available: true } | { available: false; reason: string }> {
  const classStart = new Date(startsAt);
  const classEnd = new Date(classStart.getTime() + durationMin * 60000);

  // UTC Day and Time extraction (aligns with how trainers set availability)
  const dayOfWeek = classStart.getUTCDay();
  const startTimeStr =
    String(classStart.getUTCHours()).padStart(2, "0") +
    ":" +
    String(classStart.getUTCMinutes()).padStart(2, "0");
  const endTimeStr =
    String(classEnd.getUTCHours()).padStart(2, "0") +
    ":" +
    String(classEnd.getUTCMinutes()).padStart(2, "0");

  const availability = await db
    .select()
    .from(trainerAvailability)
    .where(
      and(
        eq(trainerAvailability.trainerId, trainerId),
        eq(trainerAvailability.dayOfWeek, dayOfWeek)
      )
    )
    .get();

  if (!availability) {
    return { available: false, reason: "No availability set for this day." };
  }

  const isWithinAvailability =
    startTimeStr >= availability.startTime && endTimeStr <= availability.endTime;

  if (!isWithinAvailability) {
    return { available: false, reason: "Class time falls outside of the trainer's working hours." };
  }

  const conflictingClasses = await db
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.trainerId, trainerId),
        eq(classes.cancelled, false)
      )
    );

  for (const cls of conflictingClasses) {
    if (excludeClassId && cls.id === excludeClassId) continue;

    const existStart = new Date(cls.startsAt);
    const existEnd = new Date(existStart.getTime() + cls.durationMin * 60000);

    // Overlap condition
    if (classStart < existEnd && classEnd > existStart) {
      return { available: false, reason: "Trainer already has a class scheduled during this time." };
    }
  }

  return { available: true };
}
