import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createSession, hashPassword, validatePassword } from "@/lib/auth";
import { HttpError, badRequest, readJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security";
import { seedStarterContent } from "@/lib/seed";
import { setupCodeRequired, teacherCount } from "@/lib/setup";

const body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().max(200),
  setupCode: z.string().max(200).optional(),
  starterContent: z.boolean().default(true),
});

/** First-run only: create the teacher account. Disabled once any teacher exists. */
export const POST = route(async (req) => {
  const input = await readJson(req, body);
  if (!(await rateLimit(`setup:${clientIp(req)}`, 10, 900))) throw new HttpError(429, "Too many attempts. Wait 15 minutes.");
  if ((await teacherCount()) > 0) throw new HttpError(403, "Setup is already complete. Please sign in.");
  if (setupCodeRequired()) {
    const expected = process.env.TEACHER_SETUP_CODE?.trim();
    if (!expected) throw new HttpError(403, "Setup is locked: add TEACHER_SETUP_CODE to your hosting environment settings first.");
    if ((input.setupCode ?? "").trim() !== expected) throw new HttpError(403, "The setup code is not correct. It is the TEACHER_SETUP_CODE value you set when deploying.");
  }
  const pwErr = validatePassword(input.password);
  if (pwErr) throw badRequest(pwErr);
  const db = await getDb();
  const [t] = await db
    .insert(schema.teachers)
    .values({ name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password) })
    .returning();
  // Guard against two setups racing: keep only the first teacher.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.teachers);
  if (n > 1) {
    await db.delete(schema.teachers).where(sql`${schema.teachers.id} = ${t.id}`);
    throw new HttpError(403, "Setup is already complete. Please sign in.");
  }
  if (input.starterContent) await seedStarterContent(t.id);
  await createSession(t.id);
  return { ok: true };
});
