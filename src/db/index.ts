import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * Singleton Drizzle client for flexfit.db (path overridable via
 * DB_FILE). Not responsible for schema definition (schema.ts) or seeding
 * (seed.ts) — just the connection.
 *
 * The client is cached on `globalThis` outside production so Next.js's
 * dev-mode module reloading doesn't open a fresh SQLite connection on
 * every hot reload.
 */
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof createClient> | undefined;
};

const client =
  globalForDb.client ??
  createClient({ url: process.env.DB_FILE ?? "file:flexfit.db" });

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { schema };
