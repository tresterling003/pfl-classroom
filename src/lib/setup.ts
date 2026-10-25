import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function teacherCount() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.teachers);
  return n;
}

/** In production the first-run setup page needs TEACHER_SETUP_CODE so strangers can't claim a new site. */
export function setupCodeRequired() {
  return process.env.NODE_ENV === "production" || !!process.env.TEACHER_SETUP_CODE;
}
