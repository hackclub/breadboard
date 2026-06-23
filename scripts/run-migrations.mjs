#!/usr/bin/env node
/**
 * Runs Drizzle migrations before starting the Next.js server.
 * ESM — drizzle-orm is ESM-only.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL not set, skipping migrations");
    return;
  }

  const migrationsFolder = path.resolve(__dirname, "../drizzle");
  console.log(`[migrate] running migrations from ${migrationsFolder}`);

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] migrations applied");
  } catch (err) {
    console.error("[migrate] migration error:", err.message);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err.message);
  process.exit(1);
});
