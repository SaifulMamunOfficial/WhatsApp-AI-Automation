/**
 * Docker-free development database: PGlite (real PostgreSQL compiled to WASM) served on
 * the normal Postgres port, so the app, drizzle-kit and psql connect exactly as they
 * would to Docker. Data lives in ./.pglite (git-ignored).
 *
 *   npm run dev:db       # then, in another terminal: npm run dev
 *
 * Use this OR `npm run db:up` (Docker), not both: they share port 5432.
 * Development only. Production uses real PostgreSQL in Docker Compose.
 */
import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";

// Listen on the port DATABASE_URL points to, so `.env` works unchanged. DEV_DB_PORT overrides.
function portFromDatabaseUrl(): number | undefined {
  try {
    const p = new URL(process.env.DATABASE_URL ?? "").port;
    return p ? Number(p) : undefined;
  } catch {
    return undefined;
  }
}
const PORT = Number(process.env.DEV_DB_PORT ?? portFromDatabaseUrl() ?? 5432);

async function main() {
  const client = new PGlite(path.resolve(".pglite"));
  await client.waitReady;
  await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });

  const server = new PGLiteSocketServer({ db: client, port: PORT, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  console.log(`Dev database ready on 127.0.0.1:${PORT} (migrations applied). Ctrl+C to stop.`);

  const stop = async () => {
    await server.stop();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
