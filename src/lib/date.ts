/**
 * Hours between `now` and an ISO timestamp (negative if `iso` is in the past).
 */
export function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

/**
 * Returns today's date in YYYY-MM-DD format (UTC based on server).
 */
export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Adds the given number of days to a YYYY-MM-DD string and returns the new string.
 */
export function addDaysToIso(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
