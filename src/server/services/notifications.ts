import { db as defaultDb } from "@/db";
import { notifications } from "@/db/schema";

type DB = typeof defaultDb;

/**
 * Shared notification helpers. Called from mutation handlers to create
 * in-app notifications for members. Each function inserts a row into
 * the `notifications` table.
 */

export async function notifyWaitlistPromotion(
  db: DB,
  userId: number,
  className: string,
  classTime: string,
) {
  await db.insert(notifications).values({
    userId,
    type: "waitlist_promotion",
    title: "You're in!",
    message: `A spot opened up in ${className} (${classTime}). You've been moved from the waitlist to confirmed.`,
  });
}

export async function notifyClassCancelled(
  db: DB,
  userId: number,
  className: string,
  classTime: string,
  creditsRefunded: number,
) {
  const refundMsg =
    creditsRefunded > 0
      ? ` ${creditsRefunded} credit${creditsRefunded === 1 ? "" : "s"} have been refunded.`
      : "";
  await db.insert(notifications).values({
    userId,
    type: "class_cancelled",
    title: "Class cancelled",
    message: `${className} (${classTime}) has been cancelled.${refundMsg}`,
  });
}

export async function notifyMembershipExpiring(
  db: DB,
  userId: number,
  planName: string,
  endDate: string,
) {
  await db.insert(notifications).values({
    userId,
    type: "membership_expiring",
    title: "Membership expiring soon",
    message: `Your ${planName} membership expires on ${endDate}. Renew now to keep booking classes.`,
  });
}
