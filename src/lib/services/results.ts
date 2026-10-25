import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ownedAssignment, ownedAttempt } from "./access";
import { badRequest, notFound } from "../http";
import { withDefaults } from "../settings";
import { decideOutcome, runScoreFromResponses, sectionPassPercent, summarizeAttempt, type AttemptSummary } from "../scoring";
import { canonical } from "../grading/normalize";
import { correctAnswerText, refreshCompletion } from "./student";
import type { SnapshotQuestion, VersionSnapshot } from "../types";

type Snapshot = VersionSnapshot;

async function versionsMap(versionIds: string[]) {
  const db = await getDb();
  const m = new Map<string, { snapshot: Snapshot; versionNumber: number }>();
  if (!versionIds.length) return m;
  const rows = await db.select().from(schema.assignmentVersions).where(inArray(schema.assignmentVersions.id, [...new Set(versionIds)]));
  for (const r of rows) m.set(r.id, { snapshot: r.snapshot, versionNumber: r.versionNumber });
  return m;
}

export interface ResultRow {
  attemptId: string;
  studentName: string;
  periodId: string | null;
  periodName: string;
  versionNumber: number;
  completion: AttemptSummary["completion"];
  passing: AttemptSummary["passing"];
  sections: { title: string; percent: number | null; points: number; weight: number; status: string; runs: number; pendingReview: number }[];
  suggestedPoints: number;
  suggestedPercent: number;
  totalPoints: number;
  provisional: boolean;
  pendingReview: number;
  approvedGrade: number | null;
  gradebookGrade: number;
  gradebookSource: "approved" | "suggested";
  activeSeconds: number;
  startedAt: Date;
  completedAt: Date | null;
  lastActiveAt: Date;
  workingNow: boolean;
  resumeCode: string;
  missingSections: string[];
}

export async function getAssignmentResults(teacherId: string, assignmentId: string, opts: { periodId?: string } = {}) {
  const { assignment } = await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.isPreview, false), opts.periodId ? eq(schema.attempts.periodId, opts.periodId) : undefined))
    .orderBy(asc(schema.attempts.studentName));
  const periods = await db.select().from(schema.periods).where(eq(schema.periods.courseId, assignment.courseId)).orderBy(asc(schema.periods.sortOrder));
  const periodName = new Map(periods.map((p) => [p.id, p.name]));
  const vmap = await versionsMap(attempts.map((a) => a.versionId));
  const ids = attempts.map((a) => a.id);
  const runs = ids.length ? await db.select().from(schema.sectionRuns).where(inArray(schema.sectionRuns.attemptId, ids)) : [];
  const runIds = runs.map((r) => r.id);
  const responses = runIds.length ? await db.select().from(schema.responses).where(inArray(schema.responses.runId, runIds)) : [];
  const runsByAttempt = new Map<string, typeof runs>();
  for (const r of runs) {
    if (!runsByAttempt.has(r.attemptId)) runsByAttempt.set(r.attemptId, []);
    runsByAttempt.get(r.attemptId)!.push(r);
  }
  const respByRun = new Map<string, typeof responses>();
  for (const r of responses) {
    if (!respByRun.has(r.runId)) respByRun.set(r.runId, []);
    respByRun.get(r.runId)!.push(r);
  }

  const now = Date.now();
  const rows: ResultRow[] = attempts.map((att) => {
    const v = vmap.get(att.versionId)!;
    const settings = withDefaults(v.snapshot.settings);
    const myRuns = runsByAttempt.get(att.id) ?? [];
    const myResp = myRuns.flatMap((r) => respByRun.get(r.id) ?? []);
    const sum = summarizeAttempt(v.snapshot, settings, myRuns, myResp);
    const gradebook = att.approvedGrade ?? sum.suggestedPercent;
    return {
      attemptId: att.id,
      studentName: att.studentName,
      periodId: att.periodId,
      periodName: att.periodId ? periodName.get(att.periodId) ?? "—" : "—",
      versionNumber: v.versionNumber,
      completion: sum.completion,
      passing: sum.passing,
      sections: sum.sections.map((s) => ({ title: s.title, percent: s.percent, points: s.points, weight: s.weight, status: s.status, runs: s.runsSubmitted, pendingReview: s.pendingReview })),
      suggestedPoints: sum.suggestedPoints,
      suggestedPercent: sum.suggestedPercent,
      totalPoints: sum.totalPoints,
      provisional: sum.provisional,
      pendingReview: sum.pendingReview,
      approvedGrade: att.approvedGrade,
      gradebookGrade: Math.round(gradebook * 10) / 10,
      gradebookSource: att.approvedGrade != null ? "approved" : "suggested",
      activeSeconds: att.activeSeconds,
      startedAt: att.startedAt,
      completedAt: att.completedAt,
      lastActiveAt: att.lastActiveAt,
      workingNow: att.status !== "completed" && now - att.lastActiveAt.getTime() < 2 * 60_000,
      resumeCode: att.resumeCode,
      missingSections: sum.sections.filter((s) => !s.cleared).map((s) => s.title),
    };
  });

  // ── question analytics (all submitted runs, per source question) ──
  const qstats = new Map<string, { key: string; prompt: string; type: string; section: string; attempts: number; earned: number; max: number; wrong: number; wrongAnswers: Map<string, number> }>();
  for (const att of attempts) {
    const v = vmap.get(att.versionId)!;
    const qByKey = new Map<string, { q: SnapshotQuestion; section: string }>();
    for (const s of v.snapshot.sections) for (const q of s.questions) qByKey.set(`${s.key}|${q.key}`, { q, section: s.title });
    for (const run of runsByAttempt.get(att.id) ?? []) {
      if (run.status !== "submitted") continue;
      for (const r of respByRun.get(run.id) ?? []) {
        const entry = qByKey.get(`${run.sectionKey}|${r.questionKey}`);
        if (!entry) continue;
        const id = entry.q.sourceQuestionId;
        if (!qstats.has(id)) qstats.set(id, { key: id, prompt: entry.q.prompt, type: entry.q.type, section: entry.section, attempts: 0, earned: 0, max: 0, wrong: 0, wrongAnswers: new Map() });
        const st = qstats.get(id)!;
        const sc = r.teacherScore ?? r.autoScore;
        st.attempts++;
        st.earned += sc;
        st.max += r.maxScore;
        if (sc < r.maxScore - 1e-9) {
          st.wrong++;
          if (entry.q.type === "fill_blank") {
            const t = String((r.answer as { text?: string })?.text ?? "").trim().toLowerCase();
            if (t) st.wrongAnswers.set(t, (st.wrongAnswers.get(t) ?? 0) + 1);
          }
        }
      }
    }
  }
  const questionStats = [...qstats.values()]
    .map((q) => ({
      ...q,
      accuracy: q.max > 0 ? Math.round((q.earned / q.max) * 1000) / 10 : 0,
      wrongAnswers: [...q.wrongAnswers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([answer, count]) => ({ answer, count })),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const completed = rows.filter((r) => r.completion === "completed");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const sectionTitles = rows[0]?.sections.map((s) => s.title) ?? [];
  const stats = {
    students: rows.length,
    completed: completed.length,
    inProgress: rows.filter((r) => r.completion === "in_progress").length,
    workingNow: rows.filter((r) => r.workingNow).length,
    needsReview: rows.reduce((a, r) => a + r.pendingReview, 0),
    averageCompleted: avg(completed.map((r) => r.gradebookGrade)),
    averageAll: avg(rows.map((r) => r.gradebookGrade)),
    sectionAverages: sectionTitles.map((t, i) => ({ title: t, average: avg(rows.map((r) => r.sections[i]?.percent).filter((x): x is number => x != null)) })),
  };
  return { assignment: { ...assignment, settings: withDefaults(assignment.settings) }, periods, rows, stats, questionStats };
}

// ───────────── one student's work ─────────────

export async function getAttemptDetail(teacherId: string, attemptId: string) {
  const { attempt, assignment } = await ownedAttempt(teacherId, attemptId);
  const db = await getDb();
  const vmap = await versionsMap([attempt.versionId]);
  const { snapshot, versionNumber } = vmap.get(attempt.versionId)!;
  const settings = withDefaults(snapshot.settings);
  const runs = await db.select().from(schema.sectionRuns).where(eq(schema.sectionRuns.attemptId, attemptId)).orderBy(asc(schema.sectionRuns.runNumber));
  const runIds = runs.map((r) => r.id);
  const responses = runIds.length ? await db.select().from(schema.responses).where(inArray(schema.responses.runId, runIds)) : [];
  const summary = summarizeAttempt(snapshot, settings, runs, responses);
  const [period] = attempt.periodId ? await db.select().from(schema.periods).where(eq(schema.periods.id, attempt.periodId)) : [];
  const sections = snapshot.sections.map((s, i) => {
    const qByKey = new Map(s.questions.map((q) => [q.key, q]));
    return {
      key: s.key,
      title: s.title,
      summary: summary.sections[i],
      runs: runs
        .filter((r) => r.sectionKey === s.key)
        .map((r) => ({
          id: r.id,
          runNumber: r.runNumber,
          status: r.status,
          percent: r.percent,
          score: r.score,
          maxScore: r.maxScore,
          outcome: r.outcome,
          countsForGrade: r.countsForGrade,
          submittedAt: r.submittedAt,
          startedAt: r.startedAt,
          responses: r.questionKeys.map((k) => {
            const q = qByKey.get(k)!;
            const resp = responses.find((x) => x.runId === r.id && x.questionKey === k);
            const ans = (resp?.answer ?? r.draftAnswers[k] ?? {}) as Record<string, unknown>;
            let yourAnswer = "";
            if (q.data.type === "multiple_choice") yourAnswer = q.data.choices.find((c) => c.id === ans.choiceId)?.text ?? "";
            else if (q.data.type === "matching") yourAnswer = (typeof ans.choice === "string" && r.layout[`t:${ans.choice}`]?.[0]) || "";
            else yourAnswer = typeof ans.text === "string" ? ans.text : "";
            return {
              responseId: resp?.id ?? null,
              key: k,
              sourceQuestionId: q.sourceQuestionId,
              type: q.type,
              prompt: q.prompt,
              yourAnswer,
              correctAnswer: correctAnswerText(q),
              rubric: q.data.type === "short_answer" ? q.data.rubric.map((c) => ({ concept: c.concept, points: c.points })) : undefined,
              autoScore: resp?.autoScore ?? null,
              teacherScore: resp?.teacherScore ?? null,
              maxScore: resp?.maxScore ?? q.points,
              method: resp?.method ?? null,
              detail: resp?.detail ?? null,
              needsReview: resp?.needsReview ?? false,
              reviewedAt: resp?.reviewedAt ?? null,
              teacherFeedback: resp?.teacherFeedback ?? null,
            };
          }),
        })),
    };
  });
  return { attempt, assignment, periodName: period?.name ?? null, versionNumber, settings, summary, sections };
}

// ───────────── overrides & approvals ─────────────

async function ownedResponse(teacherId: string, responseId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ r: schema.responses, run: schema.sectionRuns, att: schema.attempts })
    .from(schema.responses)
    .innerJoin(schema.sectionRuns, eq(schema.sectionRuns.id, schema.responses.runId))
    .innerJoin(schema.attempts, eq(schema.attempts.id, schema.sectionRuns.attemptId))
    .where(eq(schema.responses.id, responseId));
  if (!row) throw notFound("Answer not found");
  await ownedAttempt(teacherId, row.att.id);
  return row;
}

/** Recompute a run's score and pass/fail after the teacher changes a score. */
export async function recomputeRun(runId: string) {
  const db = await getDb();
  const [run] = await db.select().from(schema.sectionRuns).where(eq(schema.sectionRuns.id, runId));
  const [att] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, run.attemptId));
  const [v] = await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.id, att.versionId));
  const settings = withDefaults(v.snapshot.settings);
  const section = v.snapshot.sections.find((s) => s.key === run.sectionKey)!;
  const resp = await db.select().from(schema.responses).where(eq(schema.responses.runId, runId));
  const { score, max, percent } = runScoreFromResponses(resp);
  const passPercent = sectionPassPercent(settings, section.settings?.passPercent);
  const outcome = decideOutcome(settings, passPercent, resp);
  await db.update(schema.sectionRuns).set({ score, maxScore: max, percent, outcome }).where(eq(schema.sectionRuns.id, runId));
  await refreshCompletion(att.id, v.snapshot);
}

export async function overrideResponse(teacherId: string, responseId: string, input: { score: number | null; feedback?: string | null }) {
  const { r } = await ownedResponse(teacherId, responseId);
  if (input.score != null && (input.score < 0 || input.score > r.maxScore)) throw badRequest(`Score must be between 0 and ${r.maxScore}.`);
  const db = await getDb();
  await db
    .update(schema.responses)
    .set({
      teacherScore: input.score,
      teacherFeedback: input.feedback === undefined ? r.teacherFeedback : input.feedback || null,
      reviewedAt: new Date(),
    })
    .where(eq(schema.responses.id, responseId));
  await recomputeRun(r.runId);
}

/** Accept the automated score(s) as reviewed. */
export async function approveResponses(teacherId: string, responseIds: string[]) {
  const db = await getDb();
  const runIds = new Set<string>();
  for (const id of responseIds) {
    const { r } = await ownedResponse(teacherId, id);
    await db.update(schema.responses).set({ reviewedAt: new Date() }).where(eq(schema.responses.id, id));
    runIds.add(r.runId);
  }
  for (const id of runIds) await recomputeRun(id);
  return { count: responseIds.length };
}

/**
 * Fill-in-the-blank: give credit to EVERY student in this assignment who typed this same answer
 * (after normalization) for this question. Useful when the key missed a valid variation.
 */
export async function acceptAnswerForAll(teacherId: string, assignmentId: string, sourceQuestionId: string, answer: string) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const target = canonical(answer);
  if (!target) throw badRequest("Empty answer");
  const rows = await db
    .select({ r: schema.responses, run: schema.sectionRuns, versionId: schema.attempts.versionId })
    .from(schema.responses)
    .innerJoin(schema.sectionRuns, eq(schema.sectionRuns.id, schema.responses.runId))
    .innerJoin(schema.attempts, eq(schema.attempts.id, schema.sectionRuns.attemptId))
    .where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.isPreview, false)));
  const vmap = await versionsMap(rows.map((r) => r.versionId));
  const runIds = new Set<string>();
  let count = 0;
  for (const row of rows) {
    const snap = vmap.get(row.versionId)!.snapshot;
    const q = snap.sections.find((s) => s.key === row.run.sectionKey)?.questions.find((x) => x.key === row.r.questionKey);
    if (!q || q.sourceQuestionId !== sourceQuestionId || q.type !== "fill_blank") continue;
    const text = String((row.r.answer as { text?: string })?.text ?? "");
    if (canonical(text) !== target) continue;
    if ((row.r.teacherScore ?? row.r.autoScore) >= row.r.maxScore) continue;
    await db.update(schema.responses).set({ teacherScore: row.r.maxScore, reviewedAt: new Date(), teacherFeedback: "Accepted by your teacher." }).where(eq(schema.responses.id, row.r.id));
    runIds.add(row.r.runId);
    count++;
  }
  for (const id of runIds) await recomputeRun(id);
  return { count };
}

export async function setApprovedGrade(teacherId: string, attemptId: string, grade: number | null, note?: string) {
  await ownedAttempt(teacherId, attemptId);
  if (grade != null && (grade < 0 || grade > 1000)) throw badRequest("Grade must be between 0 and 1000.");
  const db = await getDb();
  const set: Partial<typeof schema.attempts.$inferInsert> = { approvedGrade: grade, approvedAt: grade == null ? null : new Date() };
  if (note !== undefined) set.teacherNote = note;
  await db.update(schema.attempts).set(set).where(eq(schema.attempts.id, attemptId));
}

/** Approve the suggested grade for every completed submission with nothing left to review. */
export async function approveAllReady(teacherId: string, assignmentId: string, periodId?: string) {
  const { rows } = await getAssignmentResults(teacherId, assignmentId, { periodId });
  const db = await getDb();
  let count = 0;
  for (const r of rows) {
    if (r.completion !== "completed" || r.pendingReview > 0 || r.approvedGrade != null) continue;
    await db.update(schema.attempts).set({ approvedGrade: r.suggestedPercent, approvedAt: new Date() }).where(eq(schema.attempts.id, r.attemptId));
    count++;
  }
  return { count };
}

export async function deleteAttempt(teacherId: string, attemptId: string) {
  await ownedAttempt(teacherId, attemptId);
  const db = await getDb();
  await db.delete(schema.attempts).where(eq(schema.attempts.id, attemptId));
}

export async function deleteAllAttempts(teacherId: string, assignmentId: string) {
  await ownedAssignment(teacherId, assignmentId);
  const db = await getDb();
  const rows = await db
    .delete(schema.attempts)
    .where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.isPreview, false)))
    .returning({ id: schema.attempts.id });
  return { count: rows.length };
}

/** Privacy/retention: delete all student work older than a date across this teacher's classes. */
export async function deleteStudentDataBefore(teacherId: string, before: Date) {
  const db = await getDb();
  const own = db
    .select({ id: schema.assignments.id })
    .from(schema.assignments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(eq(schema.courses.teacherId, teacherId));
  const rows = await db
    .delete(schema.attempts)
    .where(and(inArray(schema.attempts.assignmentId, own), lt(schema.attempts.startedAt, before)))
    .returning({ id: schema.attempts.id });
  return { count: rows.length };
}

/** Short answers waiting for the teacher, across all of their classes (or one assignment). */
export async function reviewQueue(teacherId: string, assignmentId?: string) {
  const db = await getDb();
  const rows = await db
    .select({
      responseId: schema.responses.id,
      questionKey: schema.responses.questionKey,
      answer: schema.responses.answer,
      autoScore: schema.responses.autoScore,
      maxScore: schema.responses.maxScore,
      method: schema.responses.method,
      detail: schema.responses.detail,
      runId: schema.sectionRuns.id,
      sectionKey: schema.sectionRuns.sectionKey,
      attemptId: schema.attempts.id,
      studentName: schema.attempts.studentName,
      versionId: schema.attempts.versionId,
      assignmentId: schema.assignments.id,
      assignmentTitle: schema.assignments.title,
      courseName: schema.courses.name,
      submittedAt: schema.sectionRuns.submittedAt,
    })
    .from(schema.responses)
    .innerJoin(schema.sectionRuns, eq(schema.sectionRuns.id, schema.responses.runId))
    .innerJoin(schema.attempts, eq(schema.attempts.id, schema.sectionRuns.attemptId))
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(
      and(
        eq(schema.courses.teacherId, teacherId),
        eq(schema.attempts.isPreview, false),
        eq(schema.responses.needsReview, true),
        isNull(schema.responses.reviewedAt),
        assignmentId ? eq(schema.assignments.id, assignmentId) : undefined,
      ),
    )
    .orderBy(asc(schema.sectionRuns.submittedAt))
    .limit(500);
  const vmap = await versionsMap(rows.map((r) => r.versionId));
  return rows.map((r) => {
    const q = vmap.get(r.versionId)!.snapshot.sections.find((s) => s.key === r.sectionKey)?.questions.find((x) => x.key === r.questionKey);
    return {
      ...r,
      prompt: q?.prompt ?? "",
      rubric: q?.data.type === "short_answer" ? q.data.rubric.map((c) => ({ concept: c.concept, points: c.points })) : [],
      sampleAnswer: q?.data.type === "short_answer" ? q.data.sampleAnswer : "",
      text: String((r.answer as { text?: string })?.text ?? ""),
    };
  });
}

// ───────────── dashboard ─────────────

export async function dashboardData(teacherId: string) {
  const db = await getDb();
  const assignments = await db
    .select({ a: schema.assignments, courseName: schema.courses.name, courseColor: schema.courses.color })
    .from(schema.assignments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(and(eq(schema.courses.teacherId, teacherId), isNull(schema.assignments.archivedAt), isNull(schema.courses.archivedAt)))
    .orderBy(desc(schema.assignments.updatedAt));
  const active = assignments.filter((x) => x.a.status === "published");
  const ids = active.map((x) => x.a.id);
  const counts = ids.length
    ? await db
        .select({
          id: schema.attempts.assignmentId,
          started: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${schema.attempts.status} = 'completed')::int`,
          working: sql<number>`count(*) filter (where ${schema.attempts.status} <> 'completed' and ${schema.attempts.lastActiveAt} > now() - interval '2 minutes')::int`,
        })
        .from(schema.attempts)
        .where(and(inArray(schema.attempts.assignmentId, ids), eq(schema.attempts.isPreview, false)))
        .groupBy(schema.attempts.assignmentId)
    : [];
  const cmap = new Map(counts.map((c) => [c.id, c]));
  const queue = await reviewQueue(teacherId);
  const reviewByAssignment = new Map<string, number>();
  for (const q of queue) reviewByAssignment.set(q.assignmentId, (reviewByAssignment.get(q.assignmentId) ?? 0) + 1);
  const recent = await db
    .select({ attemptId: schema.attempts.id, studentName: schema.attempts.studentName, completedAt: schema.attempts.completedAt, assignmentId: schema.assignments.id, title: schema.assignments.title })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(and(eq(schema.courses.teacherId, teacherId), eq(schema.attempts.status, "completed"), eq(schema.attempts.isPreview, false)))
    .orderBy(desc(schema.attempts.completedAt))
    .limit(8);
  const upcoming = active
    .filter((x) => x.a.closesAt && x.a.closesAt.getTime() > Date.now())
    .sort((a, b) => a.a.closesAt!.getTime() - b.a.closesAt!.getTime())
    .slice(0, 6);
  // averages for active assignments (completed students, suggested or approved grade)
  const averages = new Map<string, number | null>();
  for (const x of active.slice(0, 12)) {
    const r = await getAssignmentResults(teacherId, x.a.id);
    averages.set(x.a.id, r.stats.averageCompleted);
  }
  return {
    active: active.map((x) => ({
      ...x.a,
      courseName: x.courseName,
      courseColor: x.courseColor,
      started: cmap.get(x.a.id)?.started ?? 0,
      completed: cmap.get(x.a.id)?.completed ?? 0,
      working: cmap.get(x.a.id)?.working ?? 0,
      needsReview: reviewByAssignment.get(x.a.id) ?? 0,
      average: averages.get(x.a.id) ?? null,
    })),
    drafts: assignments.filter((x) => x.a.status === "draft").slice(0, 6).map((x) => ({ ...x.a, courseName: x.courseName })),
    upcoming: upcoming.map((x) => ({ id: x.a.id, title: x.a.title, closesAt: x.a.closesAt, courseName: x.courseName })),
    reviewCount: queue.length,
    recent,
  };
}

