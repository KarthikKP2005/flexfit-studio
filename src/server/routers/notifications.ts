import { z } from "zod";
import { and, eq, desc, not, sql } from "drizzle-orm";
import { notifications, users } from "@/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc";

/**
 * In-app notifications: unread badge, list, mark-as-read, and admin
 * broadcast. Not responsible for: generating notifications from other
 * flows — this router only ever inserts `broadcast`'s "announcement"
 * type. `waitlist_promotion` and `class_cancelled` are inserted directly
 * by bookings.ts/corporate-bookings.ts/classes.ts (NOTIF-002/NOTIF-003)
 * at their own trigger points, and `membership_expiring` by the
 * scheduled job in server/jobs/membership-expiry.ts (NOTIF-004) — none
 * of that logic lives here.
 */

export const notificationsRouter = router({
  /** Count of this user's unread notifications. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [{ count }] = await ctx.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          not(notifications.read)
        )
      );

    return Number(count) || 0;
  }),

  /** This user's notifications, newest first, capped at `limit` (default 50). */
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  /** Marks all of this user's currently-unread notifications as read. */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          not(notifications.read)
        )
      );

    return { ok: true };
  }),

  /**
   * Sends an "announcement" notification to every user with role
   * "member". Title/message have no length validation beyond zod's
   * default string type (any length, including empty, is accepted).
   *
   * Behavior note (see NOTIF-001 in known-issues.md — not fixed here):
   * despite the `activeMembers` variable name, the query only filters on
   * `role`, not `active` — deactivated members are still sent the
   * notification.
   *
   * @throws FORBIDDEN if the caller isn't an admin
   */
  broadcast: adminProcedure
    .input(
      z.object({
        title: z.string(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const activeMembers = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "member"));

      if (activeMembers.length === 0) {
        return { ok: true, count: 0 };
      }

      await ctx.db.insert(notifications).values(
        activeMembers.map((member) => ({
          userId: member.id,
          type: "announcement" as const,
          title: input.title,
          message: input.message,
        }))
      );

      return { ok: true, count: activeMembers.length };
    }),
});
