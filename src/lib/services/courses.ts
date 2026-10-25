import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ownedCourse } from "./access";
import { notFound } from "../http";
import { duplicateAssignment } from "./assignments";

export async function listCourses(teacherId: string, opts: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.teacherId, teacherId), opts.includeArchived ? undefined : isNull(schema.courses.archivedAt)))
    .orderBy(asc(schema.courses.sortOrder), asc(schema.courses.createdAt));
  return rows;
}

export async function createCourse(teacherId: string, input: { name: string; description?: string; color?: string; periods?: string[] }) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.courses).where(eq(schema.courses.teacherId, teacherId));
  const [c] = await db
    .insert(schema.courses)
    .values({ teacherId, name: input.name, description: input.description ?? "", color: input.color ?? "indigo", sortOrder: n })
    .returning();
  const periodNames = input.periods?.length ? input.periods : [];
  if (periodNames.length) {
    await db.insert(schema.periods).values(periodNames.map((name, i) => ({ courseId: c.id, name, sortOrder: i })));
  }
  return c;
}

export async function updateCourse(teacherId: string, courseId: string, patch: { name?: string; description?: string; color?: string; archived?: boolean }) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const set: Partial<typeof schema.courses.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [c] = await db.update(schema.courses).set(set).where(eq(schema.courses.id, courseId)).returning();
  return c;
}

/** Permanently delete a class with everything in it (questions, assignments, student work). */
export async function deleteCourse(teacherId: string, courseId: string) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
}

// ───────────── units ─────────────

export async function listUnits(courseId: string) {
  const db = await getDb();
  return db.select().from(schema.units).where(eq(schema.units.courseId, courseId)).orderBy(asc(schema.units.sortOrder), asc(schema.units.createdAt));
}

export async function createUnit(teacherId: string, courseId: string, name: string) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.units).where(eq(schema.units.courseId, courseId));
  const [u] = await db.insert(schema.units).values({ courseId, name, sortOrder: n }).returning();
  return u;
}

async function ownedUnit(teacherId: string, unitId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.units).where(eq(schema.units.id, unitId));
  if (!u) throw notFound("Unit not found");
  await ownedCourse(teacherId, u.courseId);
  return u;
}

export async function updateUnit(teacherId: string, unitId: string, patch: { name?: string; archived?: boolean; sortOrder?: number }) {
  await ownedUnit(teacherId, unitId);
  const db = await getDb();
  const set: Partial<typeof schema.units.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [u] = await db.update(schema.units).set(set).where(eq(schema.units.id, unitId)).returning();
  return u;
}

/** Deleting a unit keeps its assignments and questions (they become "No unit"). */
export async function deleteUnit(teacherId: string, unitId: string) {
  await ownedUnit(teacherId, unitId);
  const db = await getDb();
  await db.delete(schema.units).where(eq(schema.units.id, unitId));
}

// ───────────── periods ─────────────

export async function listPeriods(courseId: string, includeArchived = false) {
  const db = await getDb();
  return db
    .select()
    .from(schema.periods)
    .where(and(eq(schema.periods.courseId, courseId), includeArchived ? undefined : isNull(schema.periods.archivedAt)))
    .orderBy(asc(schema.periods.sortOrder), asc(schema.periods.createdAt));
}

export async function createPeriod(teacherId: string, courseId: string, name: string) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.periods).where(eq(schema.periods.courseId, courseId));
  const [p] = await db.insert(schema.periods).values({ courseId, name, sortOrder: n }).returning();
  return p;
}

async function ownedPeriod(teacherId: string, periodId: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.periods).where(eq(schema.periods.id, periodId));
  if (!p) throw notFound("Period not found");
  await ownedCourse(teacherId, p.courseId);
  return p;
}

export async function updatePeriod(teacherId: string, periodId: string, patch: { name?: string; archived?: boolean; sortOrder?: number }) {
  await ownedPeriod(teacherId, periodId);
  const db = await getDb();
  const set: Partial<typeof schema.periods.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [p] = await db.update(schema.periods).set(set).where(eq(schema.periods.id, periodId)).returning();
  return p;
}

/** Deleting a period keeps student work (their period shows as "—"). Archiving is usually better. */
export async function deletePeriod(teacherId: string, periodId: string) {
  await ownedPeriod(teacherId, periodId);
  const db = await getDb();
  await db.delete(schema.periods).where(eq(schema.periods.id, periodId));
}

// ───────────── duplicate a whole class (e.g. for next school year) ─────────────

/**
 * Copies units, question bank and assignments (as unpublished drafts with new join codes).
 * Student submissions are NEVER copied.
 */
export async function duplicateCourse(teacherId: string, courseId: string, input: { name: string; copyPeriods: boolean }) {
  const src = await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const copy = await createCourse(teacherId, { name: input.name, description: src.description, color: src.color });

  const unitMap = new Map<string, string>();
  for (const u of await listUnits(courseId)) {
    const [nu] = await db.insert(schema.units).values({ courseId: copy.id, name: u.name, sortOrder: u.sortOrder, archivedAt: u.archivedAt }).returning();
    unitMap.set(u.id, nu.id);
  }
  if (input.copyPeriods) {
    const ps = await listPeriods(courseId);
    if (ps.length) await db.insert(schema.periods).values(ps.map((p) => ({ courseId: copy.id, name: p.name, sortOrder: p.sortOrder })));
  }
  const qs = await db.select().from(schema.questions).where(eq(schema.questions.courseId, courseId));
  const questionMap = new Map<string, string>();
  for (const q of qs) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = q;
    const [nq] = await db
      .insert(schema.questions)
      .values({ ...rest, courseId: copy.id, unitId: q.unitId ? unitMap.get(q.unitId) ?? null : null })
      .returning({ id: schema.questions.id });
    questionMap.set(q.id, nq.id);
  }
  const as = await db.select({ id: schema.assignments.id }).from(schema.assignments).where(eq(schema.assignments.courseId, courseId));
  for (const a of as) {
    await duplicateAssignment(teacherId, a.id, { targetCourseId: copy.id, questionMap, unitMap, keepTitle: true });
  }
  return copy;
}

export async function courseCounts(courseIds: string[]) {
  if (!courseIds.length) return new Map<string, { assignments: number; questions: number }>();
  const db = await getDb();
  const a = await db
    .select({ id: schema.assignments.courseId, n: sql<number>`count(*)::int` })
    .from(schema.assignments)
    .where(and(inArray(schema.assignments.courseId, courseIds), isNull(schema.assignments.archivedAt)))
    .groupBy(schema.assignments.courseId);
  const q = await db
    .select({ id: schema.questions.courseId, n: sql<number>`count(*)::int` })
    .from(schema.questions)
    .where(and(inArray(schema.questions.courseId, courseIds), isNull(schema.questions.archivedAt)))
    .groupBy(schema.questions.courseId);
  const m = new Map<string, { assignments: number; questions: number }>();
  for (const id of courseIds) m.set(id, { assignments: 0, questions: 0 });
  for (const r of a) m.get(r.id)!.assignments = r.n;
  for (const r of q) m.get(r.id)!.questions = r.n;
  return m;
}
