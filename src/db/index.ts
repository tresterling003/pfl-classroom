/**
 * Database connection.
 *
 * - DATABASE_URL set (production, e.g. Neon or Supabase) → regular Postgres via postgres.js.
 * - DATABASE_URL empty (local development) → embedded Postgres (PGlite) stored in ./.data,
 *   created and migrated automatically. Nothing to install.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __pflDb?: Promise<DB>; __pflDbOverride?: DB };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // prepare:false keeps us compatible with poolers (Supabase/Neon transaction mode).
    const client = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
    return drizzlePg(client, { schema });
  }
  if (process.env.VERCEL || process.env.REQUIRE_DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add a Postgres database (e.g. Neon) in your hosting settings — see docs/SETUP.md, step 3.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? localDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

/**
 * Local database folder. It must live OUTSIDE the project: the dev server watches the
 * project folder, and database writes inside it trigger page reloads mid-assignment.
 * An older copy in ./.data/pglite is moved here automatically.
 */
function localDataDir() {
  const dir = path.join(os.homedir(), ".pfl-classroom", "pglite");
  const old = path.join(process.cwd(), ".data", "pglite");
  if (!fs.existsSync(dir) && fs.existsSync(path.join(old, "PG_VERSION"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try {
      fs.renameSync(old, dir);
    } catch {
      fs.cpSync(old, dir, { recursive: true });
    }
  }
  return dir;
}

export function getDb(): Promise<DB> {
  if (g.__pflDbOverride) return Promise.resolve(g.__pflDbOverride);
  g.__pflDb ??= connect().catch((err) => {
    g.__pflDb = undefined;
    throw err;
  });
  return g.__pflDb;
}

/** Used by automated tests to run against an in-memory database. */
export function setDbForTests(db: DB | undefined) {
  g.__pflDbOverride = db;
}

export { schema };
