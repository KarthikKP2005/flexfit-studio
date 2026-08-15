import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

/**
 * tRPC setup: request context, transformer, and the four procedure
 * builders every router is composed from. Not responsible for business
 * logic or route-level validation — that lives in each router.
 */

export const SESSION_COOKIE = "flexfit_session";

/**
 * Builds the per-request tRPC context: reads the session cookie, looks up
 * the session + user, and attaches `user` if the session exists and
 * hasn't expired.
 *
 * Behavior note (AUTH-005, documented not fixed — see known-issues.md):
 * this only checks `expiresAt`, not `users.active` — a session created
 * before an admin deactivates the user stays valid until it naturally
 * expires (up to 30 days, see auth.ts's SESSION_DAYS). Login itself does
 * reject inactive users; only this existing-session path doesn't re-check.
 */
export async function createContext(opts?: { req: Request }) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  // Extract client IP address for rate-limiting
  const ip = opts?.req?.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  let user: User | null = null;

  if (token) {
    const row = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.token, token))
      .get();

    if (row && new Date(row.session.expiresAt) > new Date()) {
      user = row.user;
    }
  }

  return { db, user, token, ip };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

/** No auth required. `ctx.user` may be null. */
export const publicProcedure = t.procedure;

/**
 * Requires a signed-in user of any role.
 * @throws UNAUTHORIZED if there's no valid session.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Requires a signed-in trainer or admin.
 * @throws UNAUTHORIZED if there's no valid session (via protectedProcedure).
 * @throws FORBIDDEN if the signed-in user is a member.
 */
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "trainer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff only." });
  }
  return next({ ctx });
});

/**
 * Requires a signed-in admin.
 * @throws UNAUTHORIZED if there's no valid session (via protectedProcedure).
 * @throws FORBIDDEN if the signed-in user is a member or trainer.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return next({ ctx });
});
