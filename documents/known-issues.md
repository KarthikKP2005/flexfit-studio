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

## TRAINER-09. Corporate Check-ins Excluded From Trainer Class Stats
- **Severity**: Low (display issue) — corporate members can still check in, but
  the aggregate check-in counter on the trainer schedule doesn't increment.
- **Issue**: The `checkins` database table has a hard foreign key `bookingId`
  that strictly links to the `bookings` table (normal personal bookings).
  There is no way to link a checkin record to the `corporateBookings` table.
- **Why not fixed**: Fixing this requires a database schema change (either
  making the relationship polymorphic with a `bookingType` column, or adding
  a `corporateBookingId` column). Per AGENT_RULES.md Rule 1.2, schema changes
  are heavy operations requiring explicit architectural approval, and are left
  as a documented gap for now.
- **What "fixed" would look like**: A database migration altering the `checkins`
  schema, followed by updates to the `kiosk` check-in logic and the
  `checkinCount` subquery in `src/server/routers/trainers.ts`.
