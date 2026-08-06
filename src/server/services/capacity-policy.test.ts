import { describe, expect, it } from "vitest";
import { calculateCapacity } from "./capacity-policy";

describe("calculateCapacity", () => {
  it("counts confirmed membership and corporate bookings together", () => {
    expect(
      calculateCapacity(20, {
        membershipConfirmed: 12,
        corporateConfirmed: 8,
      }),
    ).toEqual({
      membershipConfirmed: 12,
      corporateConfirmed: 8,
      totalConfirmed: 20,
      spotsLeft: 0,
      full: true,
    });
  });

  it("does not report negative availability when data is already over capacity", () => {
    expect(
      calculateCapacity(2, {
        membershipConfirmed: 2,
        corporateConfirmed: 1,
      }),
    ).toMatchObject({ totalConfirmed: 3, spotsLeft: 0, full: true });
  });
});
