/**
 * Display formatters for money and dates. Pure functions, no I/O.
 * Not responsible for: parsing/validating input, timezone selection (see
 * note on formatDateTime/formatDate below), or currency conversion — all
 * amounts are assumed to already be INR cents.
 */

/**
 * Formats an integer amount of cents as a whole-rupee INR string
 * (e.g. 150000 -> "₹1,500"). Fractional rupees are truncated, not rounded
 * to the nearest rupee-equivalent of the original cents — see
 * maximumFractionDigits: 0.
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Formats an ISO timestamp as "<short weekday>, <day> <short month>,
 * <12h time>" (e.g. "Sat, 15 Aug, 8:00 pm").
 *
 * Behavior note: no `timeZone` is passed to toLocaleString, so this
 * renders in whatever timezone the running process (browser or server) is
 * in, not a fixed business timezone. Class start times, cutoff windows,
 * etc. are computed elsewhere against the raw ISO/UTC value — this
 * function only affects what's displayed.
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

/**
 * Formats an ISO timestamp as "<day> <short month> <year>"
 * (e.g. "15 Aug 2026"). Same local-timezone caveat as formatDateTime.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
