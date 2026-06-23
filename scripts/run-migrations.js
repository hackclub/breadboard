#!/usr/bin/env node
/**
 * Runs Drizzle migrations before starting the Next.js server.
 * Standalone — does not depend on Next.js module resolution.
 */
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const path = require("node:path");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL not set, skipping migrations");
    return;
  }

  const migrationsFolder = path.resolve(__dirname, "drizzle");
  console.log(`[migrate] running migrations from ${migrationsFolder}`);

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] migrations applied");
  } catch (err) {
    console.error("[migrate] migration error:", err.message);
    // Don't crash — the app may still work with existing schema
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err.message);
  process.exit(1);
});
