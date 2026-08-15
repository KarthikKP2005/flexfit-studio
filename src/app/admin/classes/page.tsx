import { ClassScheduler } from "@/features/admin-classes/components/ClassScheduler";

/**
 * Admin class scheduling: create, cancel, swap trainer. All data
 * fetching, mutations, state, and rendering live in `ClassScheduler`
 * (Phase 3 of restructure-plan.md — moved verbatim out of this file) —
 * this page is route-level composition only, per plan.md item #54's own
 * pattern.
 */
export default function AdminClassesPage() {
  return <ClassScheduler />;
}
