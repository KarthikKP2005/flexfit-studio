import { eq, sql } from "drizzle-orm";
import { payments } from "@/db/schema";

/**
 * Phase 2.4 of restructure-plan.md: `admin.revenueByMonth` and
 * `revenueByMethod`'s query logic, moved out of the router unchanged.
 * Not responsible for: corporate credit top-ups (ADMIN-002, documented
 * not fixed — these never create a `payments` row, so they're invisible
 * to both functions here).
 */

/** Total paid-payment revenue grouped by month, newest first. */
export async function getRevenueByMonth(db: typeof import("@/db").db) {
  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${payments.createdAt})`,
      totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .where(eq(payments.status, "paid"))
    .groupBy(sql`strftime('%Y-%m', ${payments.createdAt})`)
    .orderBy(sql`strftime('%Y-%m', ${payments.createdAt}) DESC`);

  return rows.map((r) => ({
    month: r.month,
    totalCents: Number(r.totalCents),
  }));
}

/** Total paid-payment revenue and count grouped by payment method, highest first. */
export async function getRevenueByMethod(db: typeof import("@/db").db) {
  const rows = await db
    .select({
      method: payments.method,
      totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(payments)
    .where(eq(payments.status, "paid"))
    .groupBy(payments.method)
    .orderBy(sql`sum(${payments.amountCents}) DESC`);

  return rows.map((r) => ({
    method: r.method,
    totalCents: Number(r.totalCents),
    count: Number(r.count),
  }));
}
