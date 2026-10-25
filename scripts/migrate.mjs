// Applies database migrations. Runs automatically before `npm run build` (e.g. on Vercel).
// Local development without DATABASE_URL uses the embedded database, which migrates itself.
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping (local embedded database migrates on startup).");
  process.exit(0);
}
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("[migrate] Database is up to date.");
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
