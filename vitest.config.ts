import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Minimal Vitest config — resolves the `@/*` path alias to `./src`
 * (mirrors tsconfig.json) so test files can import application code the
 * same way the app itself does. Deliberately does not add setupFiles,
 * globalSetup, or fileParallelism tuning; add those only when a specific
 * test actually needs them (see documents/architecture-decisions.md's
 * 2026-08-15 correction entry for why this stays minimal).
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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
