import "server-only";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/lib/db/db";

export async function runMigrations() {
  console.log("[migrate] running pending migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] migrations complete");
}
