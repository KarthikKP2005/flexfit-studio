"use client";

import { RequireRole } from "@/components/require-role";
import { ReportsDashboard } from "@/features/admin-reports/components/ReportsDashboard";

/**
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md) — this
 * page previously had no client-side gating at all, so a denied visitor
 * saw the full, normal-looking report shell with empty-state copy
 * instead of any indication access was denied.
 *
 * All data fetching, mutations, state, and rendering live in
 * `ReportsDashboard` (Phase 3 of restructure-plan.md — moved verbatim
 * out of this file) — this page is now route-level composition only,
 * per plan.md item #54's own pattern.
 */
export default function AdminReportsPage() {
  return (
    <RequireRole role="admin">
      <ReportsDashboard />
    </RequireRole>
  );
}
