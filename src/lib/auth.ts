/**
 * Teacher authentication: email + password (bcrypt), random session token in an
 * httpOnly cookie, only a SHA-256 of the token stored in the database.
 */
import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "./security";
import { HttpError } from "./http";

const COOKIE = "pfl_teacher";
const SESSION_DAYS = 14;

export interface Teacher {
  id: string;
  email: string;
  name: string;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

export async function createSession(teacherId: string) {
  const db = await getDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.teacherSessions).values({ tokenHash: sha256(token), teacherId, expiresAt });
  await db.delete(schema.teacherSessions).where(lt(schema.teacherSessions.expiresAt, new Date()));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.teacherSessions).where(eq(schema.teacherSessions.tokenHash, sha256(token)));
  }
  jar.delete(COOKIE);
}

export async function getTeacher(): Promise<Teacher | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.teachers.id, email: schema.teachers.email, name: schema.teachers.name })
    .from(schema.teacherSessions)
    .innerJoin(schema.teachers, eq(schema.teachers.id, schema.teacherSessions.teacherId))
    .where(and(eq(schema.teacherSessions.tokenHash, sha256(token)), gt(schema.teacherSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/** For pages: redirect to login when signed out. */
export async function requireTeacherPage(): Promise<Teacher> {
  const t = await getTeacher();
  if (!t) redirect("/login");
  return t;
}

/** For API routes: 401 when signed out. */
export async function requireTeacher(): Promise<Teacher> {
  const t = await getTeacher();
  if (!t) throw new HttpError(401, "Please sign in again.");
  return t;
}
