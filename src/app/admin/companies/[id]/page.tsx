import { RequireRole } from "@/components/require-role";
import { CompanyDetail } from "@/features/admin-companies/components/CompanyDetail";

/**
 * Single company's detail page. All data fetching, mutations, state,
 * and rendering live in `CompanyDetail` (Phase 3 of restructure-plan.md
 * — moved verbatim out of this file) — this page is route-level
 * composition only, per plan.md item #54's own pattern.
 *
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md) — this page
 * previously had no client-side gating at all, so a denied visitor
 * permanently saw the actively misleading "Company not found" (the
 * `getById` query failing for auth reasons, not because the company
 * doesn't exist).
 */
export default function CompanyDetailsPage() {
  return (
    <RequireRole role="admin">
      <CompanyDetail />
    </RequireRole>
  );
}
