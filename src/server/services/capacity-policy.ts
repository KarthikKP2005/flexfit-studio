/**
 * A class seat is occupied by a confirmed booking, regardless of whether the
 * attendee used membership or corporate credits. Waitlisted and cancelled
 * bookings deliberately do not consume capacity.
 */
export type CapacityCounts = {
  membershipConfirmed: number;
  corporateConfirmed: number;
};

export type CapacitySnapshot = CapacityCounts & {
  totalConfirmed: number;
  spotsLeft: number;
  full: boolean;
};

export function calculateCapacity(
  capacity: number,
  { membershipConfirmed, corporateConfirmed }: CapacityCounts,
): CapacitySnapshot {
  const totalConfirmed = membershipConfirmed + corporateConfirmed;
  const spotsLeft = Math.max(0, capacity - totalConfirmed);

  return {
    membershipConfirmed,
    corporateConfirmed,
    totalConfirmed,
    spotsLeft,
    full: totalConfirmed >= capacity,
  };
}
