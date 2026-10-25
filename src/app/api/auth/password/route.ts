import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { hashPassword, requireTeacher, validatePassword, verifyPassword } from "@/lib/auth";
import { HttpError, badRequest, readJson, route } from "@/lib/http";

const body = z.object({ current: z.string().max(200), next: z.string().max(200), name: z.string().trim().min(1).max(100).optional() });

export const POST = route(async (req) => {
  const me = await requireTeacher();
  const input = await readJson(req, body);
  const db = await getDb();
  const [t] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, me.id));
  if (input.next) {
    if (!(await verifyPassword(input.current, t.passwordHash))) throw new HttpError(403, "Your current password is not correct.");
    const err = validatePassword(input.next);
    if (err) throw badRequest(err);
    await db.update(schema.teachers).set({ passwordHash: await hashPassword(input.next) }).where(eq(schema.teachers.id, me.id));
    // sign out other devices
    await db.delete(schema.teacherSessions).where(eq(schema.teacherSessions.teacherId, me.id));
  }
  if (input.name) await db.update(schema.teachers).set({ name: input.name }).where(eq(schema.teachers.id, me.id));
  return { ok: true, reauth: !!input.next };
});
