import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { users, memberships, membershipPlans, bookings } from "@/db/schema";
import { router, protectedProcedure, staffProcedure, adminProcedure } from "../trpc";

/**
 * Member self-service (profile) plus staff-facing member directory
 * (search, lookup, activate/deactivate, role changes). Not responsible
 * for: what counts as a member's "current" membership in booking
 * eligibility — that's a separate query in bookings.ts, and the two can
 * disagree (see MEMBER-002 in known-issues.md).
 */

export const membersRouter = router({
  /**
   * The caller's own profile: user fields, their membership (see
   * behavior note below), and a count of attended classes.
   *
   * Behavior note (see MEMBER-002 in known-issues.md — not fixed here):
   * `membership` is whichever row has the latest endDate, regardless of
   * status — a cancelled/expired membership can be shown as current if
   * it happens to have a later endDate than the actually-active one.
   */
  profile: protectedProcedure.query(async ({ ctx }) => {
    const membership = await ctx.db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        creditsRemaining: memberships.creditsRemaining,
        planName: membershipPlans.name,
        planCredits: membershipPlans.classCredits,
      })
      .from(memberships)
      .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(eq(memberships.userId, ctx.user.id))
      .orderBy(desc(memberships.endDate))
      .get();

    const [{ attended }] = await ctx.db
      .select({ attended: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(eq(bookings.userId, ctx.user.id), eq(bookings.status, "attended")),
      );

    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
      membership: membership ?? null,
      classesAttended: Number(attended),
    };
  }),

  /** Updates the caller's own name and/or phone. Fields omitted from the input are left untouched. */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.user.id))
        .returning()
        .get();
    }),

  /**
   * Staff directory search by name/email substring.
   *
   * Behavior note: not restricted to role "member" — matches any user
   * (member, trainer, or admin), and with an empty query returns every
   * user up to `limit`, not just members.
   */
  search: staffProcedure
    .input(z.object({ q: z.string().default(""), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const term = `%${input.q.trim()}%`;
      return ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .where(
          input.q.trim()
            ? or(like(users.name, term), like(users.email, term))
            : undefined,
        )
        .limit(input.limit);
    }),

  /**
   * Full user detail plus membership history, for staff. Strips
   * passwordHash before returning (unlike auth.ts's `me` — see AUTH-001).
   *
   * @throws NOT_FOUND if the user doesn't exist
   */
  byId: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      const history = await ctx.db
        .select({
          id: memberships.id,
          planName: membershipPlans.name,
          startDate: memberships.startDate,
          endDate: memberships.endDate,
          status: memberships.status,
          creditsRemaining: memberships.creditsRemaining,
        })
        .from(memberships)
        .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
        .where(eq(memberships.userId, user.id))
        .orderBy(desc(memberships.startDate));

      const { passwordHash: _omit, ...safe } = user;
      return { ...safe, memberships: history };
    }),

  /**
   * Activates/deactivates a user account.
   *
   * Behavior note (see MEMBER-003 in known-issues.md — not fixed here):
   * a nonexistent id silently returns undefined instead of throwing
   * NOT_FOUND. Also: this does not invalidate the user's existing
   * sessions (see trpc.ts's createContext note) — deactivating someone
   * doesn't sign them out.
   */
  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set({ active: input.active })
        .where(eq(users.id, input.id))
        .returning()
        .get();
    }),

  /**
   * Changes a user's role.
   *
   * Behavior note (see MEMBER-003 in known-issues.md — not fixed here):
   * a nonexistent id silently returns undefined instead of throwing
   * NOT_FOUND.
   */
  setRole: adminProcedure
    .input(z.object({ id: z.number(), role: z.enum(["member", "trainer", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.id))
        .returning()
        .get();
    }),

  /**
   * Kiosk/front-desk lookup by email or phone substring, restricted to
   * role "member" (a match on a trainer/admin's email is treated as not
   * found).
   *
   * Behavior note (see MEMBER-001 in known-issues.md — not fixed here):
   * wildcard match with no ordering and a single `.get()` — if more than
   * one member matches, which one is returned is arbitrary.
   *
   * @throws NOT_FOUND if no user matches, or the match isn't a member
   */
  lookupByEmailOrPhone: staffProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const term = `%${input.query.trim()}%`;
      const user = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .where(
          or(
            like(users.email, term),
            like(users.phone, term),
          ),
        )
        .get();

      if (!user || user.role !== "member") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      return user;
    }),
});
