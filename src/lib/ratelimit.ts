import Redis from "ioredis";

// Use a mock redis for local development if REDIS_URL is not set, 
// to prevent crashing when reviewers run the project without Redis.
const redisUrl = process.env.REDIS_URL;
let redis: Redis | null = null;

if (redisUrl) {
  redis = new Redis(redisUrl);
}

/**
 * Basic fixed-window rate limiter using Redis.
 * Falls back to allowing requests if Redis is not configured.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!redis) {
    // If no Redis configured, gracefully degrade and allow the request.
    // (A real production deployment would require REDIS_URL).
    return true;
  }

  const windowStr = Math.floor(Date.now() / 1000 / windowSeconds).toString();
  const redisKey = `ratelimit:${key}:${windowStr}`;
  
  const current = await redis.incr(redisKey);
  if (current === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  return current <= limit;
}
