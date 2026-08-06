import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing/verification using Node's built-in scrypt, at
 * default cost parameters (N/r/p) — not configurable here. Not
 * responsible for: password strength rules (see auth.ts's zod schema for
 * the minimum-length check), rate limiting, or session issuance.
 */

const KEY_LENGTH = 32;

/**
 * Hashes a plaintext password with a fresh random salt.
 * Returns "<16-byte salt as hex>:<32-byte derived key as hex>" — the
 * combined string is what gets stored in users.passwordHash.
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Verifies a plaintext password against a "<salt>:<digest>" string
 * previously produced by hashPassword. Uses a timing-safe comparison on
 * the derived key.
 *
 * Returns false (rather than throwing) for a malformed `stored` value —
 * e.g. missing the colon separator, or an empty salt/digest half.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const derived = scryptSync(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
