import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hoursUntil, getTodayIsoDate, addDaysToIso } from "../lib/date";

describe("date utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates hoursUntil correctly", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    vi.setSystemTime(now);

    expect(hoursUntil("2026-08-01T15:00:00Z")).toBe(3);
    expect(hoursUntil("2026-08-01T10:00:00Z")).toBe(-2);
  });

  it("gets today ISO date correctly", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    vi.setSystemTime(now);

    expect(getTodayIsoDate()).toBe("2026-08-01");
  });

  it("adds days to ISO date correctly", () => {
    expect(addDaysToIso("2026-08-01", 5)).toBe("2026-08-06");
    expect(addDaysToIso("2026-08-28", 5)).toBe("2026-09-02"); // crosses month boundary
  });
});
