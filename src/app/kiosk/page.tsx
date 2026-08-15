import { RequireRole } from "@/components/require-role";
import { CheckInKiosk } from "@/features/kiosk/components/CheckInKiosk";

/**
 * Front-desk check-in flow. All data fetching, mutations, state, and
 * rendering live in `CheckInKiosk` (Phase 3 of restructure-plan.md —
 * moved verbatim out of this file) — this page is route-level
 * composition only, per plan.md item #54's own literal example for
 * this exact page.
 *
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md), which
 * replaces this page's own previous inline role check — that check ran
 * before `auth.me` itself settled, so real staff also saw a false
 * "Access denied" flash on every load.
 */
export default function KioskPage() {
  return (
    <RequireRole role={["admin", "trainer"]}>
      <CheckInKiosk />
    </RequireRole>
  );
}
