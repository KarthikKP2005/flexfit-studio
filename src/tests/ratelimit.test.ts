import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit } from "../lib/ratelimit";

// Mock ioredis
const redisMock = {
  pipeline: vi.fn().mockReturnThis(),
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

vi.mock("ioredis", () => {
  return {
    Redis: vi.fn(() => redisMock),
  };
});

describe("ratelimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when below limit", async () => {
    // Mock exec to return 1 (count below limit) for zcard
    redisMock.exec.mockResolvedValueOnce([
      [null, 0], // zremrangebyscore
      [null, 1], // zadd
      [null, 1], // zcard (count = 1)
      [null, 1], // expire
    ]);

    const result = await checkRateLimit("test-ip");
    expect(result.allowed).toBe(true);
    expect(redisMock.exec).toHaveBeenCalledTimes(1);
  });

  it("blocks request when above limit", async () => {
    // Mock exec to return 10 (count > 5 limit) for zcard
    redisMock.exec.mockResolvedValueOnce([
      [null, 0],
      [null, 1],
      [null, 10], // zcard (count = 10)
      [null, 1],
    ]);

    const result = await checkRateLimit("test-ip");
    expect(result.allowed).toBe(false);
    expect(redisMock.exec).toHaveBeenCalledTimes(1);
  });

  it("handles redis errors gracefully and allows request", async () => {
    redisMock.exec.mockRejectedValueOnce(new Error("Redis offline"));

    const result = await checkRateLimit("test-ip");
    expect(result.allowed).toBe(true); // Fails open
  });
});
