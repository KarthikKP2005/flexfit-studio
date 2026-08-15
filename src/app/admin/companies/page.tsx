import { RequireRole } from "@/components/require-role";
import { CompanyList } from "@/features/admin-companies/components/CompanyList";

/**
 * Corporate account list + create-company form. All data fetching,
 * mutations, state, and rendering live in `CompanyList` (Phase 3 of
 * restructure-plan.md — moved verbatim out of this file) — this page is
 * route-level composition only, per plan.md item #54's own pattern.
 *
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md) — this page
 * previously had no client-side gating at all, so a denied visitor saw
 * a fully normal, interactive admin screen ("New Company" button, create
 * form) with no indication access was denied.
 */
export default function CompaniesPage() {
  return (
    <RequireRole role="admin">
      <CompanyList />
    </RequireRole>
  );
}
