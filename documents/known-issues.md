# Known Issues

## 1. Uninitialized Database Errors (HTTP 500)
- **Issue**: API calls to `/api/trpc/classes.list` or `/api/trpc/plans.list` return HTTP 500 if the SQLite database (`flexfit.db`) has not been initialized or seeded prior to starting the dev server.
- **Resolution**: Run `pnpm run db:push` and `pnpm run db:seed` before running `pnpm dev`.

## 2. Ignored Build Scripts Warning
- **Issue**: `pnpm` issues a warning regarding ignored build scripts (`better-sqlite3`, `esbuild`, `sharp`).
- **Resolution**: Approve build scripts via `pnpm approve-builds` if native module compilation is required.

## 3. Remote Tracking Misconfiguration
- **Issue**: `origin` remote was initially set to string `"Flex"`, resulting in `fatal: 'Flex' does not appear to be a git repository`.
- **Resolution**: Update remote URL using `git remote set-url origin <URL>`.

## TRAINER-01. Trainers Cannot Cancel or Edit Their Own Classes
- **Severity**: Medium — trainers must ask an admin to modify their schedule.
- **Issue**: There is no UI for trainers to cancel or edit classes assigned to them.
  The backend endpoints (`classes.update`, `classes.cancel`) are gated behind
  `staffProcedure` / `adminProcedure`, so even a direct API call from a trainer
  session would be rejected for `cancel`.
- **Why not fixed**: The `finallist_phase1.docx` lists this as a known limitation
  but does not mandate a fix. Adding trainer self-service class editing would
  require a policy decision about which fields trainers may change (time? room?
  capacity?) and whether cancellation requires admin approval.
- **What "fixed" would look like**: A new `trainerProcedure`-gated endpoint that
  lets the trainer cancel or reschedule their own classes (identified by
  `classes.trainerId === ctx.user.id`), with appropriate side effects
  (booking cancellation, credit refunds, notifications — all of which now exist
  via the class cancellation path in `classes.cancel`).

