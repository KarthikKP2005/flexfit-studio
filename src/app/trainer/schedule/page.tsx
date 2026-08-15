import { RequireRole } from "@/components/require-role";
import { TrainerScheduleView } from "@/features/trainers/components/TrainerScheduleView";

/**
 * Trainer's own upcoming classes and weekly availability editor. Not
 * responsible for: editing/cancelling a trainer's own classes (no UI
 * calls classes.update/classes.cancel from here — those are admin-only
 * flows) or validating the time inputs client-side (trainers.ts's
 * setAvailability has no format/range validation either — see
 * TRAINER-001 in known-issues.md). All actual data fetching, mutations,
 * state, and rendering live in `TrainerScheduleView` (Phase 3 of
 * restructure-plan.md — moved verbatim out of this file, previously 552
 * lines, the largest file in the app) — this page is route-level
 * composition only, per plan.md item #54's own pattern.
 *
 * Wrapped in `RequireRole` (see AUTH-004 in known-issues.md), which
 * replaces this page's own previous inline role check — that check ran
 * before `auth.me` itself settled, so a real trainer also saw a false
 * "Access denied" flash on every load. trpc's staff-only procedures
 * remain the real security boundary underneath either way.
 */
export default function TrainerSchedulePage() {
  return (
    <RequireRole role="trainer">
      <TrainerScheduleView />
    </RequireRole>
  );
}
