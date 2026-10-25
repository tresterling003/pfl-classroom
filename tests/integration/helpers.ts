import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { setDbForTests, type DB } from "@/db";

export async function freshDb(): Promise<DB> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  setDbForTests(db as unknown as DB);
  return db as unknown as DB;
}

export async function makeTeacher(db: DB, email = "teacher@example.com") {
  const [t] = await db.insert(schema.teachers).values({ email, name: "Ms. Test", passwordHash: "x" }).returning();
  return t;
}
