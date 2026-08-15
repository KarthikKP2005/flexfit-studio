"use client";

import { RequireRole } from "@/components/require-role";
import { AdminDashboard } from "@/features/admin-dashboard/components/AdminDashboard";

/**
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md) — a
 * non-admin now sees a consistent "Access denied" message instead of
 * `admin.stats`'s raw FORBIDDEN error text. The server-side rejection on
 * every query below remains the real security boundary either way.
 *
 * All data fetching, mutations, state, and rendering live in
 * `AdminDashboard` (Phase 3 of restructure-plan.md — moved verbatim out
 * of this file) — this page is now route-level composition only, per
 * plan.md item #54's own pattern.
 */
export default function AdminPage() {
  return (
    <RequireRole role="admin">
      <AdminDashboard />
    </RequireRole>
  );
}
