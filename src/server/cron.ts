import { schedule } from "node-cron";
import { notifyExpiringMemberships } from "./jobs/membership-expiry";

/**
 * Standalone cron process for NOTIF-004 — run separately from the Next
 * app (`pnpm cron`, alongside `pnpm dev`/`pnpm start`), not through
 * Next's instrumentation.ts hook. Not responsible for: the notification
 * content or "expiring soon" query itself — see jobs/membership-expiry.ts.
 *
 * Why a separate process instead of instrumentation.ts: an earlier
 * version scheduled this from instrumentation.ts, but Next's dev-mode
 * webpack also compiles instrumentation.ts for the edge runtime, and
 * node-cron's internal `node:crypto` import isn't handled there —
 * that failure surfaced as 500s on unrelated API routes, not just a
 * cosmetic log line. Running as a plain Node script via `tsx` never
 * goes through Next's bundler at all, so the problem doesn't exist here.
 */
schedule("0 8 * * *", async () => {
  try {
    const { notified } = await notifyExpiringMemberships();
    console.log(`[cron] notifyExpiringMemberships: ${notified} notification(s) sent`);
  } catch (err) {
    console.error("[cron] notifyExpiringMemberships failed", err);
  }
});

console.log("[cron] membership-expiry job scheduled (daily at 08:00). Leave this process running.");
