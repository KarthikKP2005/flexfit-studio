import type { Config } from "drizzle-kit";

/**
 * Same schema as drizzle.config.ts, pointed at a separate disposable
 * database file so `pnpm db:test:push` never touches the real dev
 * database (flexfit.db). Run once before `pnpm test` (or whenever
 * schema.ts changes) to keep the test database's structure current.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: "file:flexfit.test.db",
  },
} satisfies Config;
