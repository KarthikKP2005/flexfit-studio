import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { users, sessions } from "@/db/schema";
import { verifyPassword, hashPassword } from "@/lib/password";
import {
  router,
  publicProcedure,
  protectedProcedure,
  SESSION_COOKIE,
} from "../trpc";
import { rateLimit } from "@/lib/ratelimit";


/**
 * Sign-up, sign-in, sign-out, and "who am I" for all roles. Not
 * responsible for: authorization (see trpc.ts's procedure builders) or
 * password strength beyond the zod min-length check below.
 */

const SESSION_DAYS = 30;

export const authRouter = router({
  /**
   * Returns the signed-in user from context, or null if not signed in.
   *
   * Behavior note (see AUTH-001 in known-issues.md — not fixed here):
   * returns ctx.user unmodified, which includes passwordHash. Every
   * authenticated client currently receives their own password hash on
   * every call to this procedure.
   */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  /**
   * Verifies email/password, creates a session row, and sets the
   * flexfit_session cookie. Returns only {id, name, role} — unlike `me`,
   * this does not leak passwordHash.
   *
   * Behavior note: the zod .email() check runs on the raw input before
   * this handler's .toLowerCase().trim() — a value with surrounding
   * whitespace is rejected as an invalid email, not silently trimmed.
   *
   * @throws UNAUTHORIZED if the email doesn't exist or the password is wrong
   *   (same message either way, so a caller can't distinguish the two)
   * @throws FORBIDDEN if the account has been deactivated (active: false)
   */
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // 1. Rate limit login attempts (max 5 per minute per email)
      const allowed = await rateLimit(`login:${input.email.toLowerCase().trim()}`, 5, 60);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many login attempts. Please try again later.",
        });
      }

      // 2. Clean up expired sessions (Security Issue 3)
      await ctx.db.delete(sessions).where(sql`${sessions.expiresAt} < ${new Date().toISOString()}`);

      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase().trim()))
        .get();

      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Email or password is incorrect.",
        });
      }

      if (!user.active) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account has been deactivated.",
        });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

      await ctx.db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      const store = await cookies();
      store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // Security Issue 2
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return { id: user.id, name: user.name, role: user.role };
    }),

  /**
   * Creates a new member account (role is always "member" — there is no
   * self-serve way to register as trainer/admin). Does not sign the new
   * user in; that's a separate `login` call.
   *
   * @throws CONFLICT if the (lowercased/trimmed) email is already registered
   */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Rate limit registration (max 3 per hour per IP/Email is ideal, here using email)
      const allowed = await rateLimit(`register:${input.email.toLowerCase().trim()}`, 3, 3600);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many registration attempts. Please try again later.",
        });
      }

      const email = input.email.toLowerCase().trim();
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists.",
        });
      }

      const created = await ctx.db
        .insert(users)
        .values({
          email,
          passwordHash: hashPassword(input.password),
          name: input.name,
          phone: input.phone ?? null,
          role: "member",
        })
        .returning()
        .get();

      return { id: created.id, name: created.name };
    }),

  /**
   * Deletes the current session row (if ctx.token is set — a caller with
   * a signed-in user but no token, which shouldn't occur through the real
   * cookie flow but is possible via a caller built directly, skips the
   * delete) and always clears the flexfit_session cookie.
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.token) {
      await ctx.db.delete(sessions).where(eq(sessions.token, ctx.token));
    }
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return { ok: true };
  }),
});
