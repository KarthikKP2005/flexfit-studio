import { TRPCError } from "@trpc/server";
import { hoursUntil } from "@/lib/date";

export const FREE_RESCHEDULE_HOURS = 4;

export function validateRescheduleRules(
  originalBooking: any,
  originalClass: any,
  targetClass: any,
  userId: number,
) {
  // Verify ownership
  if (originalBooking.userId !== userId) {
    return { valid: false, reason: "You cannot reschedule this booking." };
  }

  // Verify booking is still active
  if (
    originalBooking.status !== "booked" &&
    originalBooking.status !== "waitlisted"
  ) {
    return {
      valid: false,
      reason: "This booking is no longer active.",
    };
  }

  // Verify reschedule is allowed (within 4 hours of original class)
  const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
  if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
    return {
      valid: false,
      reason: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
    };
  }

  // Verify target class has the same name
  if (targetClass.name !== originalClass.name) {
    return {
      valid: false,
      reason: "You can only reschedule to a class with the same name.",
    };
  }

  // Verify target class is not the same class
  if (targetClass.id === originalClass.id) {
    return {
      valid: false,
      reason: "You are already booked for this class.",
    };
  }

  // Verify target class hasn't started
  if (hoursUntil(targetClass.startsAt) <= 0) {
    return {
      valid: false,
      reason: "This class has already started.",
    };
  }

  // Verify target class is not cancelled
  if (targetClass.cancelled) {
    return {
      valid: false,
      reason: "This class has been cancelled.",
    };
  }

  return { valid: true };
}
