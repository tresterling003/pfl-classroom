import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ownedCourse, ownedQuestion } from "./access";
import { badRequest } from "../http";
import { questionInputSchema, questionProblems, type QuestionInput } from "../questionSchema";
import type { QuestionType } from "../types";

export interface QuestionFilter {
  search?: string;
  type?: QuestionType | "";
  unitId?: string | "none" | "";
  topic?: string;
  difficulty?: string;
  archived?: boolean;
}

export async function listQuestions(teacherId: string, courseId: string, f: QuestionFilter = {}) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const conds = [eq(schema.questions.courseId, courseId), f.archived ? isNotNull(schema.questions.archivedAt) : isNull(schema.questions.archivedAt)];
  if (f.type) conds.push(eq(schema.questions.type, f.type));
  if (f.unitId === "none") conds.push(isNull(schema.questions.unitId));
  else if (f.unitId) conds.push(eq(schema.questions.unitId, f.unitId));
  if (f.topic) conds.push(eq(schema.questions.topic, f.topic));
  if (f.difficulty) conds.push(eq(schema.questions.difficulty, f.difficulty as "easy"));
  if (f.search?.trim()) {
    const s = `%${f.search.trim().replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(schema.questions.prompt, s), ilike(schema.questions.topic, s), ilike(schema.questions.explanation, s), sql`${schema.questions.data}::text ilike ${s}`)!);
  }
  const rows = await db
    .select()
    .from(schema.questions)
    .where(and(...conds))
    .orderBy(asc(schema.questions.topic), desc(schema.questions.createdAt));
  return rows;
}

/** How many assignment drafts use each question. */
export async function questionUsage(questionIds: string[]) {
  const m = new Map<string, { assignmentId: string; title: string }[]>();
  if (!questionIds.length) return m;
  const db = await getDb();
  const rows = await db
    .selectDistinct({ qid: schema.sectionQuestions.questionId, aid: schema.assignments.id, title: schema.assignments.title })
    .from(schema.sectionQuestions)
    .innerJoin(schema.assignmentSections, eq(schema.assignmentSections.id, schema.sectionQuestions.sectionId))
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSections.assignmentId))
    .where(inArray(schema.sectionQuestions.questionId, questionIds));
  for (const r of rows) {
    if (!m.has(r.qid)) m.set(r.qid, []);
    m.get(r.qid)!.push({ assignmentId: r.aid, title: r.title });
  }
  return m;
}

export function parseQuestionInput(raw: unknown): QuestionInput {
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw badRequest(`${i.path.join(".")}: ${i.message}`);
  }
  const problems = questionProblems(parsed.data);
  if (problems.length) throw badRequest(problems.join(" "));
  return parsed.data;
}

async function markDraftsChanged(questionIds: string[]) {
  if (!questionIds.length) return;
  const db = await getDb();
  const ids = (await questionUsage(questionIds)).values();
  const assignmentIds = [...new Set([...ids].flat().map((x) => x.assignmentId))];
  if (assignmentIds.length)
    await db.update(schema.assignments).set({ hasUnpublishedChanges: true, updatedAt: new Date() }).where(inArray(schema.assignments.id, assignmentIds));
}

export async function createQuestion(teacherId: string, courseId: string, raw: unknown) {
  await ownedCourse(teacherId, courseId);
  const input = parseQuestionInput(raw);
  const db = await getDb();
  const [q] = await db
    .insert(schema.questions)
    .values({ courseId, ...input, type: input.data.type, unitId: input.unitId ?? null })
    .returning();
  return q;
}

export async function updateQuestion(teacherId: string, questionId: string, raw: unknown) {
  await ownedQuestion(teacherId, questionId);
  const input = parseQuestionInput(raw);
  const db = await getDb();
  const [q] = await db
    .update(schema.questions)
    .set({ ...input, type: input.data.type, unitId: input.unitId ?? null, updatedAt: new Date() })
    .where(eq(schema.questions.id, questionId))
    .returning();
  // Published versions are frozen; drafts that use this question now differ from what students see.
  await markDraftsChanged([questionId]);
  return q;
}

export async function duplicateQuestion(teacherId: string, questionId: string, targetCourseId?: string) {
  const q = await ownedQuestion(teacherId, questionId);
  const courseId = targetCourseId ?? q.courseId;
  if (targetCourseId) await ownedCourse(teacherId, targetCourseId);
  const db = await getDb();
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = q;
  const [copy] = await db
    .insert(schema.questions)
    .values({ ...rest, courseId, unitId: courseId === q.courseId ? q.unitId : null, archivedAt: null })
    .returning();
  return copy;
}

export async function bulkQuestions(
  teacherId: string,
  courseId: string,
  ids: string[],
  action: { kind: "archive" | "unarchive" | "delete" } | { kind: "set"; topic?: string; difficulty?: "easy" | "medium" | "hard"; unitId?: string | null; points?: number } | { kind: "copy"; targetCourseId: string },
) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  // Only questions in this (owned) course are touched.
  const own = await db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(and(eq(schema.questions.courseId, courseId), inArray(schema.questions.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])));
  const okIds = own.map((r) => r.id);
  if (!okIds.length) return { count: 0 };
  switch (action.kind) {
    case "archive":
    case "unarchive":
      await db.update(schema.questions).set({ archivedAt: action.kind === "archive" ? new Date() : null }).where(inArray(schema.questions.id, okIds));
      break;
    case "delete":
      await markDraftsChanged(okIds);
      await db.delete(schema.questions).where(inArray(schema.questions.id, okIds));
      break;
    case "set": {
      const set: Partial<typeof schema.questions.$inferInsert> = { updatedAt: new Date() };
      if (action.topic !== undefined) set.topic = action.topic;
      if (action.difficulty !== undefined) set.difficulty = action.difficulty;
      if (action.unitId !== undefined) set.unitId = action.unitId;
      if (action.points !== undefined) set.points = action.points;
      await db.update(schema.questions).set(set).where(inArray(schema.questions.id, okIds));
      await markDraftsChanged(okIds);
      break;
    }
    case "copy":
      await ownedCourse(teacherId, action.targetCourseId);
      for (const id of okIds) await duplicateQuestion(teacherId, id, action.targetCourseId);
      break;
  }
  return { count: okIds.length };
}

export async function deleteQuestion(teacherId: string, questionId: string) {
  await ownedQuestion(teacherId, questionId);
  await markDraftsChanged([questionId]);
  const db = await getDb();
  await db.delete(schema.questions).where(eq(schema.questions.id, questionId));
}

// ───────────── import / export ─────────────

export interface ExportedQuestion {
  type: QuestionType;
  prompt: string;
  data: unknown;
  explanation: string;
  topic: string;
  difficulty: string;
  points: number;
  tags: string[];
  unit?: string;
}

export async function exportQuestions(teacherId: string, courseId: string, ids?: string[]): Promise<ExportedQuestion[]> {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const units = new Map((await db.select().from(schema.units).where(eq(schema.units.courseId, courseId))).map((u) => [u.id, u.name]));
  const rows = await db
    .select()
    .from(schema.questions)
    .where(and(eq(schema.questions.courseId, courseId), ids?.length ? inArray(schema.questions.id, ids) : undefined))
    .orderBy(asc(schema.questions.createdAt));
  return rows.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    data: q.data,
    explanation: q.explanation,
    topic: q.topic,
    difficulty: q.difficulty,
    points: q.points,
    tags: q.tags,
    unit: q.unitId ? units.get(q.unitId) : undefined,
  }));
}

/** Import questions from our JSON export (or the simple CSV format, converted client-side). */
export async function importQuestions(teacherId: string, courseId: string, items: unknown[]) {
  await ownedCourse(teacherId, courseId);
  if (!Array.isArray(items) || items.length === 0) throw badRequest("No questions found in the file.");
  if (items.length > 2000) throw badRequest("Import at most 2000 questions at a time.");
  const db = await getDb();
  const units = await db.select().from(schema.units).where(eq(schema.units.courseId, courseId));
  const unitByName = new Map(units.map((u) => [u.name.toLowerCase(), u.id]));
  const errors: string[] = [];
  const values: (typeof schema.questions.$inferInsert)[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown>;
    try {
      const unitName = typeof it.unit === "string" ? it.unit.trim() : "";
      let unitId: string | null = null;
      if (unitName) {
        unitId = unitByName.get(unitName.toLowerCase()) ?? null;
        if (!unitId) {
          const [u] = await db.insert(schema.units).values({ courseId, name: unitName, sortOrder: unitByName.size }).returning();
          unitByName.set(unitName.toLowerCase(), u.id);
          unitId = u.id;
        }
      }
      const input = parseQuestionInput({ ...it, unitId });
      values.push({ courseId, ...input, type: input.data.type, unitId });
    } catch (e) {
      errors.push(`Question ${i + 1}: ${(e as Error).message}`);
    }
  }
  if (errors.length) throw badRequest(`Nothing was imported. Fix these problems first:\n${errors.slice(0, 15).join("\n")}`);
  await db.insert(schema.questions).values(values);
  return { count: values.length };
}
