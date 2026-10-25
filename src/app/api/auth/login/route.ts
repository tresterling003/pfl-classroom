import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { clearRateLimit, clientIp, rateLimit } from "@/lib/security";

const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const { email, password } = await readJson(req, body);
  const key = `login:${clientIp(req)}:${email.toLowerCase()}`;
  if (!(await rateLimit(key, 8, 900))) throw new HttpError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
  const db = await getDb();
  const [t] = await db.select().from(schema.teachers).where(eq(schema.teachers.email, email.toLowerCase().trim()));
  // Always run bcrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, t?.passwordHash ?? "$2b$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!t || !ok) throw new HttpError(401, "That email and password don't match.");
  await clearRateLimit(key);
  await createSession(t.id);
  return { ok: true };
});
