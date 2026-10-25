import "server-only";
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ownedAssignment, ownedCourse, ownedSection } from "./access";
import { badRequest } from "../http";
import { randomCode } from "../security";
import { settingsForKind, settingsSchema, withDefaults } from "../settings";
import { questionProblems } from "../questionSchema";
import type { AssignmentSettings, SectionSettings, SnapshotSection, VersionSnapshot, QuestionType } from "../types";
import { QUESTION_TYPE_LABELS } from "../types";

type Kind = "review" | "quiz" | "practice" | "test";

async function uniqueJoinCode(): Promise<string> {
  const db = await getDb();
  for (let i = 0; i < 20; i++) {
    const code = randomCode(6);
    const [hit] = await db.select({ id: schema.assignments.id }).from(schema.assignments).where(eq(schema.assignments.joinCode, code));
    if (!hit) return code;
  }
  throw new Error("Could not generate a join code");
}

async function touch(assignmentId: string) {
  const db = await getDb();
  await db.update(schema.assignments).set({ hasUnpublishedChanges: true, updatedAt: new Date() }).where(eq(schema.assignments.id, assignmentId));
}

export const SECTION_TEMPLATES: Record<string, { title: string; instructions: string; type?: QuestionType }[]> = {
  blank: [{ title: "Section 1", instructions: "" }],
  four_sections: [
    { title: "Matching", instructions: "Match each term with its correct description.", type: "matching" },
    { title: "Fill in the Blank", instructions: "Type the word or number that best completes each sentence.", type: "fill_blank" },
    { title: "Multiple Choice", instructions: "Choose the best answer for each question.", type: "multiple_choice" },
    { title: "Short Answer", instructions: "Answer each question in your own words using complete sentences.", type: "short_answer" },
  ],
};

export async function createAssignment(
  teacherId: string,
  courseId: string,
  input: { title: string; kind?: Kind; unitId?: string | null; template?: "blank" | "four_sections"; directions?: string },
) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const kind = input.kind ?? "review";
  const [a] = await db
    .insert(schema.assignments)
    .values({
      courseId,
      unitId: input.unitId ?? null,
      title: input.title,
      kind,
      directions: input.directions ?? "",
      settings: settingsForKind(kind),
      joinCode: await uniqueJoinCode(),
    })
    .returning();
  const tpl = SECTION_TEMPLATES[input.template ?? "blank"] ?? SECTION_TEMPLATES.blank;
  await db.insert(schema.assignmentSections).values(tpl.map((s, i) => ({ assignmentId: a.id, title: s.title, instructions: s.instructions, sortOrder: i })));
  // Assign to every active period by default — teachers can untick.
  const ps = await db.select().from(schema.periods).where(and(eq(schema.periods.courseId, courseId), isNull(schema.periods.archivedAt)));
  if (ps.length) await db.insert(schema.assignmentPeriods).values(ps.map((p) => ({ assignmentId: a.id, periodId: p.id })));
  return a;
}

export async function listAssignments(teacherId: string, courseId: string, opts: { archived?: boolean } = {}) {
  await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.assignments)
    .where(and(eq(schema.assignments.courseId, courseId), opts.archived ? isNotNull(schema.assignments.archivedAt) : isNull(schema.assignments.archivedAt)))
    .orderBy(asc(schema.assignments.sortOrder), desc(schema.assignments.createdAt));
  const ids = rows.map((r) => r.id);
  const stats = new Map<string, { started: number; completed: number }>();
  if (ids.length) {
    const s = await db
      .select({
        id: schema.attempts.assignmentId,
        started: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${schema.attempts.status} = 'completed')::int`,
      })
      .from(schema.attempts)
      .where(and(inArray(schema.attempts.assignmentId, ids), eq(schema.attempts.isPreview, false)))
      .groupBy(schema.attempts.assignmentId);
    for (const r of s) stats.set(r.id, { started: r.started, completed: r.completed });
  }
  return rows.map((a) => ({ ...a, settings: withDefaults(a.settings), stats: stats.get(a.id) ?? { started: 0, completed: 0 } }));
}

export async function getAssignmentDetail(teacherId: string, assignmentId: string) {
  const { assignment, course } = await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const sections = await db
    .select()
    .from(schema.assignmentSections)
    .where(eq(schema.assignmentSections.assignmentId, assignmentId))
    .orderBy(asc(schema.assignmentSections.sortOrder), asc(schema.assignmentSections.createdAt));
  const sectionIds = sections.map((s) => s.id);
  const links = sectionIds.length
    ? await db
        .select({ sectionId: schema.sectionQuestions.sectionId, sortOrder: schema.sectionQuestions.sortOrder, q: schema.questions })
        .from(schema.sectionQuestions)
        .innerJoin(schema.questions, eq(schema.questions.id, schema.sectionQuestions.questionId))
        .where(inArray(schema.sectionQuestions.sectionId, sectionIds))
        .orderBy(asc(schema.sectionQuestions.sortOrder))
    : [];
  const periodRows = await db
    .select({ periodId: schema.assignmentPeriods.periodId })
    .from(schema.assignmentPeriods)
    .where(eq(schema.assignmentPeriods.assignmentId, assignmentId));
  const versions = await db
    .select({ id: schema.assignmentVersions.id, versionNumber: schema.assignmentVersions.versionNumber, publishedAt: schema.assignmentVersions.publishedAt })
    .from(schema.assignmentVersions)
    .where(and(eq(schema.assignmentVersions.assignmentId, assignmentId), eq(schema.assignmentVersions.isPreview, false)))
    .orderBy(desc(schema.assignmentVersions.versionNumber));
  return {
    assignment: { ...assignment, settings: withDefaults(assignment.settings) },
    course,
    sections: sections.map((s) => ({ ...s, questions: links.filter((l) => l.sectionId === s.id).map((l) => l.q) })),
    periodIds: periodRows.map((p) => p.periodId),
    versions,
  };
}

export interface AssignmentPatch {
  title?: string;
  kind?: Kind;
  directions?: string;
  unitId?: string | null;
  settings?: AssignmentSettings;
  opensAt?: string | null;
  closesAt?: string | null;
  periodIds?: string[];
}

export async function updateAssignment(teacherId: string, assignmentId: string, patch: AssignmentPatch) {
  const { assignment } = await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const set: Partial<typeof schema.assignments.$inferInsert> = { updatedAt: new Date() };
  let contentChanged = false;
  if (patch.title !== undefined) { set.title = patch.title; contentChanged = true; }
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.directions !== undefined) { set.directions = patch.directions; contentChanged = true; }
  if (patch.unitId !== undefined) {
    if (patch.unitId) {
      const [u] = await db.select().from(schema.units).where(and(eq(schema.units.id, patch.unitId), eq(schema.units.courseId, assignment.courseId)));
      if (!u) throw badRequest("Unit not in this class");
    }
    set.unitId = patch.unitId;
  }
  if (patch.settings !== undefined) {
    const parsed = settingsSchema.safeParse(patch.settings);
    if (!parsed.success) throw badRequest("Invalid settings: " + parsed.error.issues[0].message);
    set.settings = parsed.data;
    contentChanged = true;
  }
  if (patch.opensAt !== undefined) set.opensAt = patch.opensAt ? new Date(patch.opensAt) : null;
  if (patch.closesAt !== undefined) set.closesAt = patch.closesAt ? new Date(patch.closesAt) : null;
  if (set.opensAt && set.closesAt && set.opensAt > set.closesAt) throw badRequest("The close date must be after the open date.");
  if (contentChanged) set.hasUnpublishedChanges = true;
  await db.update(schema.assignments).set(set).where(eq(schema.assignments.id, assignmentId));

  if (patch.periodIds !== undefined) {
    const valid = patch.periodIds.length
      ? await db.select({ id: schema.periods.id }).from(schema.periods).where(and(eq(schema.periods.courseId, assignment.courseId), inArray(schema.periods.id, patch.periodIds)))
      : [];
    await db.delete(schema.assignmentPeriods).where(eq(schema.assignmentPeriods.assignmentId, assignmentId));
    if (valid.length) await db.insert(schema.assignmentPeriods).values(valid.map((p) => ({ assignmentId, periodId: p.id })));
  }
}

// ───────────── sections ─────────────

export async function addSection(teacherId: string, assignmentId: string, input: { title: string; instructions?: string }) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(max(${schema.assignmentSections.sortOrder}) + 1, 0)::int` })
    .from(schema.assignmentSections)
    .where(eq(schema.assignmentSections.assignmentId, assignmentId));
  const [s] = await db.insert(schema.assignmentSections).values({ assignmentId, title: input.title, instructions: input.instructions ?? "", sortOrder: n }).returning();
  await touch(assignmentId);
  return s;
}

export async function updateSection(teacherId: string, sectionId: string, patch: { title?: string; instructions?: string; settings?: SectionSettings }) {
  const { section } = await ownedSection(teacherId, sectionId);
  const db = await getDb();
  const set: Partial<typeof schema.assignmentSections.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.instructions !== undefined) set.instructions = patch.instructions;
  if (patch.settings !== undefined) {
    const pp = patch.settings.passPercent;
    const dc = patch.settings.drawCount;
    if (pp != null && (pp < 0 || pp > 100)) throw badRequest("Pass percent must be 0–100");
    if (dc != null && (dc < 0 || !Number.isInteger(dc))) throw badRequest("Question count must be a whole number");
    set.settings = { passPercent: pp ?? null, drawCount: dc || null };
  }
  await db.update(schema.assignmentSections).set(set).where(eq(schema.assignmentSections.id, sectionId));
  await touch(section.assignmentId);
}

export async function deleteSection(teacherId: string, sectionId: string) {
  const { section } = await ownedSection(teacherId, sectionId);
  const db = await getDb();
  await db.delete(schema.assignmentSections).where(eq(schema.assignmentSections.id, sectionId));
  await touch(section.assignmentId);
}

export async function reorderSections(teacherId: string, assignmentId: string, sectionIds: string[]) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const existing = await db.select({ id: schema.assignmentSections.id }).from(schema.assignmentSections).where(eq(schema.assignmentSections.assignmentId, assignmentId));
  const ok = new Set(existing.map((e) => e.id));
  let i = 0;
  for (const id of sectionIds) {
    if (!ok.has(id)) continue;
    await db.update(schema.assignmentSections).set({ sortOrder: i++ }).where(eq(schema.assignmentSections.id, id));
  }
  await touch(assignmentId);
}

/** Replace the ordered question list of a section (add/remove/reorder in one call). */
export async function setSectionQuestions(teacherId: string, sectionId: string, questionIds: string[]) {
  const { section, assignment } = await ownedSection(teacherId, sectionId);
  const unique = [...new Set(questionIds)];
  if (unique.length > 300) throw badRequest("A section can hold at most 300 questions.");
  const db = await getDb();
  const valid = unique.length
    ? await db.select({ id: schema.questions.id }).from(schema.questions).where(and(eq(schema.questions.courseId, assignment.courseId), inArray(schema.questions.id, unique)))
    : [];
  const ok = new Set(valid.map((v) => v.id));
  const ordered = unique.filter((id) => ok.has(id));
  await db.delete(schema.sectionQuestions).where(eq(schema.sectionQuestions.sectionId, sectionId));
  if (ordered.length) await db.insert(schema.sectionQuestions).values(ordered.map((questionId, i) => ({ sectionId, questionId, sortOrder: i })));
  await touch(section.assignmentId);
  return ordered.length;
}

// ───────────── snapshot / publish ─────────────

/** Build the frozen student-facing copy (with answer keys) from the current draft. */
export async function buildSnapshot(teacherId: string, assignmentId: string): Promise<{ snapshot: VersionSnapshot; problems: string[] }> {
  const d = await getAssignmentDetail(teacherId, assignmentId);
  const problems: string[] = [];
  if (!d.sections.length) problems.push("Add at least one section.");
  const sections: SnapshotSection[] = d.sections.map((s, si) => {
    if (!s.questions.length) problems.push(`Section ${si + 1} (“${s.title}”) has no questions.`);
    const draw = s.settings?.drawCount ?? 0;
    if (draw && draw > s.questions.length) problems.push(`Section ${si + 1} draws ${draw} questions but only has ${s.questions.length}.`);
    s.questions.forEach((q, qi) => {
      for (const p of questionProblems(q)) problems.push(`Section ${si + 1}, question ${qi + 1}: ${p}`);
    });
    return {
      key: s.id,
      title: s.title,
      instructions: s.instructions,
      settings: s.settings ?? {},
      questions: s.questions.map((q) => ({
        key: q.id,
        sourceQuestionId: q.id,
        type: q.type,
        prompt: q.prompt,
        data: q.data,
        explanation: q.explanation,
        points: q.points,
        topic: q.topic,
        difficulty: q.difficulty,
      })),
    };
  });
  return {
    snapshot: { title: d.assignment.title, kind: d.assignment.kind, directions: d.assignment.directions, settings: d.assignment.settings, sections },
    problems,
  };
}

export async function publishAssignment(teacherId: string, assignmentId: string) {
  const { assignment } = await ownedAssignment(teacherId, assignmentId);
  const { snapshot, problems } = await buildSnapshot(teacherId, assignmentId);
  if (problems.length) throw badRequest("Can't publish yet:\n" + problems.join("\n"));
  const db = await getDb();
  let versionId = assignment.currentVersionId;
  let versionNumber: number | null = null;
  const [current] = versionId ? await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.id, versionId)) : [];
  if (!current || JSON.stringify(current.snapshot) !== JSON.stringify(snapshot)) {
    const [{ n }] = await db
      .select({ n: sql<number>`coalesce(max(${schema.assignmentVersions.versionNumber}), 0)::int` })
      .from(schema.assignmentVersions)
      .where(and(eq(schema.assignmentVersions.assignmentId, assignmentId), eq(schema.assignmentVersions.isPreview, false)));
    const [v] = await db.insert(schema.assignmentVersions).values({ assignmentId, versionNumber: n + 1, snapshot }).returning();
    versionId = v.id;
    versionNumber = v.versionNumber;
  }
  await db
    .update(schema.assignments)
    .set({ status: "published", currentVersionId: versionId, hasUnpublishedChanges: false, updatedAt: new Date() })
    .where(eq(schema.assignments.id, assignmentId));
  return { versionId, newVersion: versionNumber };
}

/** Unpublish = close: students can no longer join or work; their results are kept. */
export async function setAssignmentOpen(teacherId: string, assignmentId: string, open: boolean) {
  const { assignment } = await ownedAssignment(teacherId, assignmentId);
  if (open) return publishAssignment(teacherId, assignmentId);
  const db = await getDb();
  await db
    .update(schema.assignments)
    .set({ status: assignment.currentVersionId ? "closed" : "draft", updatedAt: new Date() })
    .where(eq(schema.assignments.id, assignmentId));
}

export async function archiveAssignment(teacherId: string, assignmentId: string, archived: boolean) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const set: Partial<typeof schema.assignments.$inferInsert> = { archivedAt: archived ? new Date() : null, updatedAt: new Date() };
  if (archived) {
    const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
    if (a.status === "published") set.status = "closed";
  }
  await db.update(schema.assignments).set(set).where(eq(schema.assignments.id, assignmentId));
}

export async function deleteAssignment(teacherId: string, assignmentId: string) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  await db.delete(schema.assignments).where(eq(schema.assignments.id, assignmentId));
}

export async function regenerateJoinCode(teacherId: string, assignmentId: string) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const code = await uniqueJoinCode();
  await db.update(schema.assignments).set({ joinCode: code }).where(eq(schema.assignments.id, assignmentId));
  return code;
}

/**
 * Copy an assignment's draft (settings, sections, question order) as a NEW unpublished draft
 * with its own join code. Student work is never copied. When copying to another class,
 * the questions it uses are copied into that class's question bank.
 */
export async function duplicateAssignment(
  teacherId: string,
  assignmentId: string,
  opts: { targetCourseId?: string; questionMap?: Map<string, string>; unitMap?: Map<string, string>; keepTitle?: boolean; title?: string } = {},
) {
  const d = await getAssignmentDetail(teacherId, assignmentId);
  const targetCourseId = opts.targetCourseId ?? d.assignment.courseId;
  const sameCourse = targetCourseId === d.assignment.courseId;
  if (!sameCourse) await ownedCourse(teacherId, targetCourseId);
  const db = await getDb();
  const qmap = opts.questionMap ?? new Map<string, string>();
  if (!sameCourse && !opts.questionMap) {
    for (const s of d.sections) {
      for (const q of s.questions) {
        if (qmap.has(q.id)) continue;
        const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = q;
        const [nq] = await db.insert(schema.questions).values({ ...rest, courseId: targetCourseId, unitId: null }).returning({ id: schema.questions.id });
        qmap.set(q.id, nq.id);
      }
    }
  }
  const unitId = sameCourse ? d.assignment.unitId : d.assignment.unitId ? opts.unitMap?.get(d.assignment.unitId) ?? null : null;
  const [a] = await db
    .insert(schema.assignments)
    .values({
      courseId: targetCourseId,
      unitId,
      title: opts.title ?? (opts.keepTitle || !sameCourse ? d.assignment.title : `${d.assignment.title} (copy)`),
      kind: d.assignment.kind,
      directions: d.assignment.directions,
      settings: d.assignment.settings,
      joinCode: await uniqueJoinCode(),
      sortOrder: d.assignment.sortOrder,
    })
    .returning();
  for (const s of d.sections) {
    const [ns] = await db
      .insert(schema.assignmentSections)
      .values({ assignmentId: a.id, title: s.title, instructions: s.instructions, sortOrder: s.sortOrder, settings: s.settings })
      .returning();
    const qids = s.questions.map((q) => (sameCourse ? q.id : qmap.get(q.id))).filter((x): x is string => !!x);
    if (qids.length) await db.insert(schema.sectionQuestions).values(qids.map((questionId, i) => ({ sectionId: ns.id, questionId, sortOrder: i })));
  }
  if (sameCourse && d.periodIds.length) {
    await db.insert(schema.assignmentPeriods).values(d.periodIds.map((periodId) => ({ assignmentId: a.id, periodId })));
  } else if (!sameCourse) {
    const ps = await db.select().from(schema.periods).where(and(eq(schema.periods.courseId, targetCourseId), isNull(schema.periods.archivedAt)));
    if (ps.length) await db.insert(schema.assignmentPeriods).values(ps.map((p) => ({ assignmentId: a.id, periodId: p.id })));
  }
  return a;
}

export function sectionTypeSummary(questions: { type: QuestionType }[]): string {
  const counts = new Map<QuestionType, number>();
  for (const q of questions) counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${n} ${QUESTION_TYPE_LABELS[t]}`).join(" · ");
}
