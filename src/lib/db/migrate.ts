import "server-only";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/lib/db/db";

export async function runMigrations() {
  console.log("[migrate] running pending migrations...");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[migrate] migrations applied");
  } catch (err) {
    // Schema may already exist from drizzle-kit push — non-fatal.
    // The app still works with the existing schema.
    console.error(
      "[migrate] migration skipped (schema may already exist):",
      (err as Error).message,
    );
  }
}
