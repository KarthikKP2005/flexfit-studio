import { Redis } from "ioredis";

// Configure with a very short timeout so if Redis is not running locally,
// it doesn't hang the login/signup requests.
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  connectTimeout: 500, // fail quickly if Redis is down
  maxRetriesPerRequest: 1,
  retryStrategy: () => null, // Do not auto-retry on connection failure
});

const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SECONDS * 1000;

  try {
    const results = await redis
      .pipeline()
      .zremrangebyscore(key, 0, windowStart)
      .zadd(key, now, `${now}-${Math.random()}`)
      .zcard(key)
      .expire(key, RATE_LIMIT_WINDOW_SECONDS)
      .exec();

    if (!results) {
      return { allowed: true }; // Fail open
    }

    const countResult = results[2];
    if (countResult && countResult[0] === null) {
      const count = countResult[1] as number;
      if (count > RATE_LIMIT_REQUESTS) {
        return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SECONDS };
      }
    }

    return { allowed: true };
  } catch (error) {
    // If Redis is down or times out, fail open rather than blocking logins
    console.warn("Redis rate limiter failed, failing open", error);
    return { allowed: true };
  }
}
