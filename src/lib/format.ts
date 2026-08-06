/**
 * lib/format.ts — Centralized formatting utilities.
 *
 * Responsible for: consistent formatting of currency and dates/times across
 * the entire application (UI and server-side notifications).
 *
 * NOT responsible for: timezone conversion math (handled natively by Date
 * and Intl), or database query filtering.
 *
 * Fix: TRAINER-10 ("Date/timezone logic is scattered... inconsistent handling")
 * By forcing all UI components and email/notification services to use these
 * shared helpers, we eliminate the previous bugs where different pages rendered
 * the same UTC timestamp differently depending on ad-hoc formatting logic.
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Formats an ISO date string into a local human-readable date and time.
 * e.g., "Mon, 12 Aug, 9:00 am"
 * 
 * TRAINER-10: Centralizes timezone display so trainers and members see the
 * exact same formatted time for a given class, based on their local browser/system
 * timezone (via toLocaleString).
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
