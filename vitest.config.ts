import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Minimal Vitest config — resolves the `@/*` path alias to `./src`
 * (mirrors tsconfig.json) so test files can import application code the
 * same way the app itself does. Deliberately does not add setupFiles or
 * globalSetup; add those only when a specific test actually needs them
 * (see documents/architecture-decisions.md's 2026-08-15 correction entry
 * for why this stays minimal).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Set before any module (including src/db/index.ts) loads, so the
    // whole test run points at the disposable test DB, never flexfit.db.
    env: {
      DB_FILE: "file:flexfit.test.db",
    },
    // With two or more test files, the default parallel-file execution
    // opens concurrent connections to the same flexfit.test.db and hits
    // SQLITE_BUSY ("database is locked") — reproduced directly once a
    // second test file (attendance.test.ts) was added. A single shared
    // SQLite file isn't safe for concurrent writers without WAL mode or
    // a busy-timeout; running test files one at a time avoids the
    // conflict entirely. Revisit with per-worker DB files if the suite
    // grows large enough for sequential execution to matter.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
