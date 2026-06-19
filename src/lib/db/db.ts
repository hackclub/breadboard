import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

type Database = NodePgDatabase<typeof schema>;

declare global {
  var __db: Database | undefined;
  var __dbPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString,
  });

export const db: Database = globalThis.__db ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbPool = pool;
  globalThis.__db = db;
}
