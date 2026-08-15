import { PlanManager } from "@/features/admin-plans/components/PlanManager";

/**
 * Membership plan list + create-plan form. All data fetching,
 * mutations, state, and rendering live in `PlanManager` (Phase 3 of
 * restructure-plan.md — moved verbatim out of this file) — this page is
 * route-level composition only, per plan.md item #54's own pattern.
 *
 * Behavior note: unlike most other admin pages, this one has no
 * `RequireRole` wrapper — it wasn't included in the `AUTH-004` fix.
 * Preserved exactly as found; adding one would be a FIX, not a move,
 * and is out of scope here.
 */
export default function AdminPlansPage() {
  return <PlanManager />;
}
