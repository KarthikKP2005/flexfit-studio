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
