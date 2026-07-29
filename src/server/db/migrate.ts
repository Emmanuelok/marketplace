/**
 * Apply committed SQL migrations.
 *
 * This runs as Railway's pre-deploy step, so it must be strictly
 * non-interactive. `drizzle-kit push` is not suitable here: it diffs the schema
 * live and prompts for confirmation on anything it considers ambiguous (adding
 * a unique constraint, renaming a column), and `--force` does not reliably
 * suppress those prompts. A prompt in pre-deploy hangs the release forever.
 *
 * `migrate()` just applies the files in ./drizzle in order and records them in
 * a tracking table. No diffing, no prompts, no surprises.
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_DIRECT or DATABASE_URL must be set to run migrations.",
    );
  }

  // A dedicated single connection, not the app pool: migrations take advisory
  // locks and must not be multiplexed through a transaction-mode pooler.
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  try {
    process.stdout.write("Applying migrations…\n");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    process.stdout.write("Migrations up to date.\n");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(
      `\nMigration failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
