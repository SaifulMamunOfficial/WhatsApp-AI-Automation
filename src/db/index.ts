import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

// No throw when DATABASE_URL is missing: this module is imported while `next build`
// collects routes, where the variable may legitimately be absent (e.g. a Docker image
// build). pg connects lazily, so a missing URL only fails when a query actually runs.
export const pool = globalForDb.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
