/**
 * Database client.
 *
 * A single pooled `postgres` connection is reused across hot reloads in
 * development via a global, so `next dev` does not exhaust the connection
 * limit on every file save.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env, requireEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = ReturnType<typeof createClient>;

function createClient() {
  const url = requireEnv("DATABASE_URL", "database access");
  const sql = postgres(url, {
    max: env().NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for transaction-mode poolers (Supabase, PgBouncer)
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __nyansaDb?: Database };

/**
 * Lazily-constructed database handle. Accessing `db` without DATABASE_URL set
 * throws a descriptive error rather than failing at module load, which keeps
 * pure-logic tests runnable without a database.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    globalForDb.__nyansaDb ??= createClient();
    const value = Reflect.get(globalForDb.__nyansaDb, property);
    return typeof value === "function" ? value.bind(globalForDb.__nyansaDb) : value;
  },
});

export { schema };
export * from "./schema";
