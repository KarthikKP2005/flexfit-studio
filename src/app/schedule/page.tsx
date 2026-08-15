import { ScheduleBrowser } from "@/features/schedule/components/ScheduleBrowser";

/**
 * Public class browser and booking entry point. All data fetching,
 * mutations, state, and rendering live in `ScheduleBrowser` (Phase 3 of
 * restructure-plan.md — moved verbatim out of this file) — this page is
 * route-level composition only, per plan.md item #54's own pattern.
 */
export default function SchedulePage() {
  return <ScheduleBrowser />;
}
