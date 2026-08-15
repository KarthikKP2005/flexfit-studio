import { MemberDashboard } from "@/features/dashboard/components/MemberDashboard";

/**
 * Member-facing home. All data fetching, mutations, state, and
 * rendering live in `MemberDashboard` (Phase 3 of restructure-plan.md —
 * moved verbatim out of this file) — this page is route-level
 * composition only, per plan.md item #54's own pattern.
 */
export default function DashboardPage() {
  return <MemberDashboard />;
}
