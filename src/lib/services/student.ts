/**
 * Student-side engine. Students never receive answer keys: questions are sent through
 * `toStudentQuestion`, matching options use opaque per-run tokens, and all grading happens here.
 */
import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError, badRequest, forbidden, notFound } from "../http";
import { normalizeCode, randomCode, randomToken, sha256 } from "../security";
import { withDefaults } from "../settings";
import { gradeQuestion } from "../grading";
import { canRevealAnswers, decideOutcome, runScoreFromResponses, sectionPassPercent, summarizeAttempt } from "../scoring";
import type { AssignmentSettings, GradeDetail, SnapshotQuestion, SnapshotSection, VersionSnapshot } from "../types";

type Attempt = typeof schema.attempts.$inferSelect;
type Run = typeof schema.sectionRuns.$inferSelect;
type Assignment = typeof schema.assignments.$inferSelect;

export const studentCookieName = (assignmentId: string) => `pfl_s_${assignmentId.replace(/-/g, "")}`;

// ───────────── helpers ─────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeStudentName(name: string): { display: string; key: string } {
  const display = (name ?? "").replace(/\s+/g, " ").trim();
  return { display, key: display.toLowerCase().replace(/[^a-z0-9 '\-]/g, "") };
}

export function validateStudentName(name: string): string | null {
  const { display } = normalizeStudentName(name);
  if (display.length < 2) return "Please type your name.";
  if (display.length > 60) return "That name is too long.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'\-]*$/u.test(display)) return "Use letters only (for example: Maria G.).";
  return null;
}

export function assignmentOpenState(a: Pick<Assignment, "status" | "opensAt" | "closesAt" | "archivedAt" | "currentVersionId">, now = new Date()) {
  if (a.archivedAt || a.status === "draft" || !a.currentVersionId) return { open: false, closed: true, reason: "This assignment isn't available." };
  if (a.status === "closed") return { open: false, closed: true, reason: "This assignment is closed." };
  if (a.opensAt && now < a.opensAt) return { open: false, closed: false, reason: `This assignment opens ${a.opensAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` };
  if (a.closesAt && now > a.closesAt) return { open: false, closed: true, reason: "This assignment is closed." };
  return { open: true, closed: false, reason: "" };
}

/** Teacher previews are always "open", even for drafts. */
function openFor(attempt: Pick<Attempt, "isPreview">, a: Assignment) {
  return attempt.isPreview ? { open: true, closed: false, reason: "" } : assignmentOpenState(a);
}

async function assignmentByCode(code: string) {
  const db = await getDb();
  const c = normalizeCode(code);
  if (c.length < 4) throw notFound("We couldn't find that code. Check it and try again.");
  const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.joinCode, c));
  if (!a || a.status === "draft" || !a.currentVersionId || a.archivedAt) throw notFound("We couldn't find that code. Check it and try again.");
  return a;
}

/** Public info for the join screen: no questions, no student data. */
export async function getJoinInfo(code: string) {
  const a = await assignmentByCode(code);
  const db = await getDb();
  const [course] = await db.select({ name: schema.courses.name }).from(schema.courses).where(eq(schema.courses.id, a.courseId));
  const periods = await db
    .select({ id: schema.periods.id, name: schema.periods.name })
    .from(schema.assignmentPeriods)
    .innerJoin(schema.periods, eq(schema.periods.id, schema.assignmentPeriods.periodId))
    .where(and(eq(schema.assignmentPeriods.assignmentId, a.id), isNull(schema.periods.archivedAt)))
    .orderBy(asc(schema.periods.sortOrder));
  const state = assignmentOpenState(a);
  return { assignmentId: a.id, code: a.joinCode, title: a.title, kind: a.kind, courseName: course?.name ?? "", periods, open: state.open, reason: state.reason };
}

// ───────────── join / identify ─────────────

export async function joinAssignment(input: { code: string; name: string; periodId: string | null; resumeCode?: string }) {
  const a = await assignmentByCode(input.code);
  const db = await getDb();
  const nameErr = validateStudentName(input.name);
  if (nameErr) throw badRequest(nameErr);
  const { display, key } = normalizeStudentName(input.name);

  const periodRows = await db
    .select({ id: schema.assignmentPeriods.periodId })
    .from(schema.assignmentPeriods)
    .innerJoin(schema.periods, eq(schema.periods.id, schema.assignmentPeriods.periodId))
    .where(and(eq(schema.assignmentPeriods.assignmentId, a.id), isNull(schema.periods.archivedAt)));
  let periodId: string | null = null;
  if (periodRows.length) {
    if (!input.periodId || !periodRows.some((p) => p.id === input.periodId)) throw badRequest("Please choose your class period.");
    periodId = input.periodId;
  }

  const [existing] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.assignmentId, a.id), periodId ? eq(schema.attempts.periodId, periodId) : isNull(schema.attempts.periodId), eq(schema.attempts.studentKey, key)));

  const token = randomToken();
  if (existing) {
    const rc = normalizeCode(input.resumeCode ?? "");
    if (!rc) {
      throw new HttpError(409, "Someone with this name already started this assignment. If that was you, enter your resume code.", "NAME_TAKEN");
    }
    if (rc !== existing.resumeCode) throw new HttpError(403, "That resume code doesn't match. Ask your teacher for help.", "BAD_RESUME");
    await db.update(schema.attempts).set({ tokenHash: sha256(token) }).where(eq(schema.attempts.id, existing.id));
    return { assignmentId: a.id, attemptId: existing.id, token, resumed: true };
  }

  const state = assignmentOpenState(a);
  if (!state.open) throw forbidden(state.reason);
  try {
    const [att] = await db
      .insert(schema.attempts)
      .values({ assignmentId: a.id, versionId: a.currentVersionId!, periodId, studentName: display, studentKey: key, tokenHash: sha256(token), resumeCode: randomCode(6) })
      .returning();
    return { assignmentId: a.id, attemptId: att.id, token, resumed: false };
  } catch (e) {
    // Unique (assignment, period, name) — two tabs racing. Treat like an existing name.
    if (String((e as { code?: string })?.code ?? (e as Error).message).includes("23505") || String(e).includes("unique")) {
      throw new HttpError(409, "Someone with this name already started this assignment. If that was you, enter your resume code.", "NAME_TAKEN");
    }
    throw e;
  }
}

/** Resolve the student's attempt from their secret cookie token. */
export async function attemptFromToken(code: string, token: string | undefined) {
  const a = await assignmentByCode(code);
  if (!token) return { assignment: a, attempt: null as Attempt | null };
  const db = await getDb();
  const [att] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.assignmentId, a.id), eq(schema.attempts.tokenHash, sha256(token))));
  return { assignment: a, attempt: att ?? null };
}

async function loadContext(attempt: Attempt) {
  const db = await getDb();
  const [assignment] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, attempt.assignmentId));
  const [version] = await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.id, attempt.versionId));
  const snapshot = version.snapshot;
  const settings = withDefaults(snapshot.settings);
  const runs = await db.select().from(schema.sectionRuns).where(eq(schema.sectionRuns.attemptId, attempt.id)).orderBy(asc(schema.sectionRuns.runNumber));
  const runIds = runs.map((r) => r.id);
  const responses = runIds.length ? await db.select().from(schema.responses).where(inArray(schema.responses.runId, runIds)) : [];
  const summary = summarizeAttempt(snapshot, settings, runs, responses);
  return { assignment, snapshot, settings, runs, responses, summary };
}

// ───────────── student-safe payloads ─────────────

export interface StudentQuestion {
  key: string;
  type: SnapshotQuestion["type"];
  prompt: string;
  points: number;
  choices?: { id: string; text: string }[];
  groupId?: string;
}

export interface MatchGroup {
  id: string;
  keys: string[];
  options: { id: string; text: string }[];
}

/** Group consecutive matching questions so they share one option list. */
function matchingGroups(keys: string[], byKey: Map<string, SnapshotQuestion>): string[][] {
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const k of keys) {
    if (byKey.get(k)?.type === "matching") cur.push(k);
    else if (cur.length) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function buildRunLayout(section: SnapshotSection, settings: AssignmentSettings) {
  const byKey = new Map(section.questions.map((q) => [q.key, q]));
  let keys = section.questions.map((q) => q.key);
  const draw = section.settings?.drawCount ?? 0;
  if (draw && draw < keys.length) {
    const picked = new Set(shuffle(keys).slice(0, draw));
    keys = keys.filter((k) => picked.has(k));
  }
  if (settings.shuffleQuestions) {
    const shuffled = shuffle(keys);
    const matching = shuffled.filter((k) => byKey.get(k)!.type === "matching");
    const others = shuffled.filter((k) => byKey.get(k)!.type !== "matching");
    // keep matching items together as one board, placed where the first one landed
    const firstIdx = shuffled.findIndex((k) => byKey.get(k)!.type === "matching");
    keys = matching.length ? [...others.slice(0, Math.max(0, firstIdx)), ...matching, ...others.slice(Math.max(0, firstIdx))] : others;
  }
  const layout: Record<string, string[]> = {};
  for (const k of keys) {
    const q = byKey.get(k)!;
    if (q.data.type === "multiple_choice") {
      const ids = q.data.choices.map((c) => c.id);
      layout[`c:${k}`] = settings.shuffleChoices && q.data.shuffle !== false ? shuffle(ids) : ids;
    }
  }
  matchingGroups(keys, byKey).forEach((group, gi) => {
    const texts: string[] = [];
    for (const k of group) {
      const d = byKey.get(k)!.data;
      if (d.type !== "matching") continue;
      texts.push(d.match);
      for (const x of d.distractors ?? []) if (x.trim()) texts.push(x);
    }
    const uniqueTexts = [...new Map(texts.map((t) => [t.trim().toLowerCase(), t])).values()];
    const tokens: string[] = [];
    for (const t of shuffle(uniqueTexts)) {
      const tok = randomToken(6);
      layout[`t:${tok}`] = [t];
      tokens.push(tok);
    }
    layout[`g:${gi}`] = tokens;
    for (const k of group) layout[`m:${k}`] = [String(gi)];
  });
  return { keys, layout };
}

function toStudentQuestions(section: SnapshotSection, run: Run): { questions: StudentQuestion[]; groups: MatchGroup[] } {
  const byKey = new Map(section.questions.map((q) => [q.key, q]));
  const groups = new Map<string, MatchGroup>();
  const questions: StudentQuestion[] = run.questionKeys.map((k) => {
    const q = byKey.get(k)!;
    const out: StudentQuestion = { key: k, type: q.type, prompt: q.prompt, points: q.points };
    if (q.data.type === "multiple_choice") {
      const order = run.layout[`c:${k}`] ?? q.data.choices.map((c) => c.id);
      const map = new Map(q.data.choices.map((c) => [c.id, c.text]));
      out.choices = order.filter((id) => map.has(id)).map((id) => ({ id, text: map.get(id)! }));
    }
    if (q.data.type === "matching") {
      const gid = run.layout[`m:${k}`]?.[0] ?? "0";
      out.groupId = gid;
      if (!groups.has(gid)) {
        const toks = run.layout[`g:${gid}`] ?? [];
        groups.set(gid, { id: gid, keys: [], options: toks.map((t) => ({ id: t, text: run.layout[`t:${t}`]?.[0] ?? "" })) });
      }
      groups.get(gid)!.keys.push(k);
    }
    return out;
  });
  return { questions, groups: [...groups.values()] };
}

// ───────────── state ─────────────

export async function getPlayerState(attempt: Attempt) {
  const ctx = await loadContext(attempt);
  const db = await getDb();
  const [course] = await db.select({ name: schema.courses.name }).from(schema.courses).where(eq(schema.courses.id, ctx.assignment.courseId));
  const [period] = attempt.periodId ? await db.select({ name: schema.periods.name }).from(schema.periods).where(eq(schema.periods.id, attempt.periodId)) : [];
  const openState = openFor(attempt, ctx.assignment);
  const s = ctx.settings;
  const sections = ctx.summary.sections.map((sec, i) => {
    const snap = ctx.snapshot.sections[i];
    const runs = ctx.runs.filter((r) => r.sectionKey === sec.key);
    const lastSubmitted = [...runs].reverse().find((r) => r.status === "submitted");
    return {
      key: sec.key,
      title: sec.title,
      instructions: snap.instructions,
      status: sec.status,
      passPercent: sec.passPercent,
      questionCount: sec.questionCount,
      percent: s.showScores ? sec.percent : null,
      bestPercent: s.showScores ? sec.bestPercent : null,
      runsSubmitted: sec.runsSubmitted,
      canRetry: sec.canRetry && openState.open,
      nextRunIsPractice: sec.nextRunIsPractice,
      maxGradedRuns: s.maxGradedRuns,
      gradedRunsUsed: sec.gradedRunsUsed,
      lastRunId: lastSubmitted?.id ?? null,
      pendingReview: sec.pendingReview,
      types: [...new Set(snap.questions.map((q) => q.type))],
    };
  });
  const active = ctx.runs.find((r) => r.status === "in_progress");
  let activeRun = null;
  if (active) {
    const section = ctx.snapshot.sections.find((x) => x.key === active.sectionKey)!;
    activeRun = await activeRunPayload(active, section, ctx.settings);
  }
  return {
    assignment: {
      title: ctx.snapshot.title,
      directions: ctx.snapshot.directions,
      kind: ctx.snapshot.kind,
      courseName: course?.name ?? "",
      closesAt: ctx.assignment.closesAt,
      open: openState.open,
      closedReason: openState.reason,
      settings: {
        passPercent: s.passPercent,
        sequential: s.sequential,
        feedbackTiming: s.feedbackTiming,
        showScores: s.showScores,
        maxGradedRuns: s.maxGradedRuns,
        gradeBasis: s.gradeBasis,
      },
    },
    student: { name: attempt.studentName, period: period?.name ?? null, resumeCode: attempt.resumeCode },
    sections,
    completion: ctx.summary.completion,
    passing: ctx.summary.passing,
    overallPercent: s.showScores ? ctx.summary.suggestedPercent : null,
    provisional: ctx.summary.provisional,
    activeRun,
  };
}

async function activeRunPayload(run: Run, section: SnapshotSection, settings: AssignmentSettings) {
  const { questions, groups } = toStudentQuestions(section, run);
  const checked: Record<string, ReturnType<typeof feedbackFor>> = {};
  if (run.checkedKeys.length) {
    const byKey = new Map(section.questions.map((q) => [q.key, q]));
    for (const k of run.checkedKeys) {
      const q = byKey.get(k);
      if (!q) continue;
      const g = await gradeForRun(q, run, run.draftAnswers[k], false);
      checked[k] = feedbackFor(q, run, run.draftAnswers[k], g.score, g.maxScore, g.detail, g.method, settings, true);
    }
  }
  return {
    id: run.id,
    sectionKey: run.sectionKey,
    runNumber: run.runNumber,
    practice: !run.countsForGrade,
    questions,
    groups,
    answers: run.draftAnswers,
    revision: run.draftRevision,
    checked,
  };
}

// ───────────── start a section ─────────────

export async function startSection(attempt: Attempt, sectionKey: string) {
  const ctx = await loadContext(attempt);
  const open = openFor(attempt, ctx.assignment);
  const idx = ctx.snapshot.sections.findIndex((s) => s.key === sectionKey);
  if (idx < 0) throw notFound("Section not found");
  const sum = ctx.summary.sections[idx];
  const existing = ctx.runs.find((r) => r.sectionKey === sectionKey && r.status === "in_progress");
  if (existing) return existing.id;
  if (!open.open) throw forbidden(open.reason);
  if (sum.status === "locked") throw forbidden(`Finish “${ctx.snapshot.sections[idx - 1]?.title}” with at least ${ctx.summary.sections[idx - 1]?.passPercent}% first.`);
  if (sum.runsSubmitted > 0 && !sum.canRetry) throw forbidden("No more tries are allowed for this section.");
  const db = await getDb();
  const section = ctx.snapshot.sections[idx];
  const { keys, layout } = buildRunLayout(section, ctx.settings);
  const runNumber = ctx.runs.filter((r) => r.sectionKey === sectionKey).length + 1;
  const countsForGrade = ctx.settings.maxGradedRuns === 0 || sum.gradedRunsUsed < ctx.settings.maxGradedRuns;
  try {
    const [run] = await db
      .insert(schema.sectionRuns)
      .values({ attemptId: attempt.id, sectionKey, runNumber, questionKeys: keys, layout, countsForGrade })
      .returning();
    return run.id;
  } catch {
    // Double-click / two tabs: the unique (attempt, section, runNumber) index stops a duplicate run.
    const [again] = await db
      .select()
      .from(schema.sectionRuns)
      .where(and(eq(schema.sectionRuns.attemptId, attempt.id), eq(schema.sectionRuns.sectionKey, sectionKey), eq(schema.sectionRuns.status, "in_progress")));
    if (again) return again.id;
    throw new HttpError(409, "Please refresh the page.");
  }
}

// ───────────── autosave ─────────────

const MAX_TEXT = { fill_blank: 300, short_answer: 5000 } as const;

function sanitizeAnswer(q: SnapshotQuestion, raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (q.type) {
    case "multiple_choice":
      return typeof a.choiceId === "string" && a.choiceId.length <= 40 ? { type: q.type, choiceId: a.choiceId } : { type: q.type, choiceId: null };
    case "matching":
      return typeof a.choice === "string" && a.choice.length <= 40 ? { type: q.type, choice: a.choice } : { type: q.type, choice: null };
    case "fill_blank":
    case "short_answer":
      return { type: q.type, text: typeof a.text === "string" ? a.text.slice(0, MAX_TEXT[q.type]) : "" };
  }
}

function isAnswered(q: SnapshotQuestion, a: Record<string, unknown> | null | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "multiple_choice":
      return !!a.choiceId;
    case "matching":
      return !!a.choice;
    default:
      return typeof a.text === "string" && a.text.trim().length > 0;
  }
}

async function loadOwnRun(attempt: Attempt, runId: string) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw notFound("Section not found");
  const [run] = await db.select().from(schema.sectionRuns).where(and(eq(schema.sectionRuns.id, runId), eq(schema.sectionRuns.attemptId, attempt.id)));
  if (!run) throw notFound("Section not found");
  const [version] = await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.id, attempt.versionId));
  const section = version.snapshot.sections.find((s) => s.key === run.sectionKey);
  if (!section) throw notFound("Section not found");
  return { run, section, snapshot: version.snapshot as VersionSnapshot, settings: withDefaults(version.snapshot.settings) };
}

export async function saveDraft(attempt: Attempt, runId: string, answers: Record<string, unknown>, revision: number) {
  const { run, section } = await loadOwnRun(attempt, runId);
  if (run.status !== "in_progress") return { saved: false, submitted: true };
  const byKey = new Map(section.questions.map((q) => [q.key, q]));
  const clean: Record<string, unknown> = { ...run.draftAnswers };
  for (const k of run.questionKeys) {
    if (run.checkedKeys.includes(k)) continue; // locked after "Check"
    if (k in answers) clean[k] = sanitizeAnswer(byKey.get(k)!, answers[k]);
  }
  const db = await getDb();
  const rows = await db
    .update(schema.sectionRuns)
    .set({ draftAnswers: clean, draftRevision: revision })
    .where(and(eq(schema.sectionRuns.id, runId), eq(schema.sectionRuns.status, "in_progress"), sql`${schema.sectionRuns.draftRevision} < ${revision}`))
    .returning({ id: schema.sectionRuns.id });
  return { saved: rows.length > 0, stale: rows.length === 0, submitted: false };
}

// ───────────── grading ─────────────

async function gradeForRun(q: SnapshotQuestion, run: Run, answer: unknown, useAI = true) {
  let matchingChosenText: string | null = null;
  if (q.type === "matching") {
    const tok = (answer as { choice?: string } | null)?.choice;
    matchingChosenText = tok ? run.layout[`t:${tok}`]?.[0] ?? null : null;
  }
  return gradeQuestion(q, answer, { matchingChosenText, useAI });
}

function displayAnswer(q: SnapshotQuestion, run: Run, answer: unknown): string {
  const a = (answer ?? {}) as Record<string, unknown>;
  if (q.data.type === "multiple_choice") return q.data.choices.find((c) => c.id === a.choiceId)?.text ?? "";
  if (q.data.type === "matching") return (typeof a.choice === "string" && run.layout[`t:${a.choice}`]?.[0]) || "";
  return typeof a.text === "string" ? a.text : "";
}

export function correctAnswerText(q: SnapshotQuestion): string {
  const d = q.data;
  if (d.type === "multiple_choice") return d.choices.find((c) => c.id === d.correctId)?.text ?? "";
  if (d.type === "matching") return d.match;
  if (d.type === "fill_blank") return d.answers[0] ?? "";
  return d.sampleAnswer;
}

export interface QuestionFeedback {
  key: string;
  type: SnapshotQuestion["type"];
  prompt: string;
  yourAnswer: string;
  correct: boolean | null;
  earned: number | null;
  max: number;
  explanation: string | null;
  correctAnswer: string | null;
  note?: string;
  concepts?: { concept: string; met: boolean }[];
  aiFeedback?: string;
  provisional: boolean;
  reviewed: boolean;
}

function feedbackFor(
  q: SnapshotQuestion,
  run: Run,
  answer: unknown,
  earned: number,
  max: number,
  detail: GradeDetail,
  method: string,
  settings: AssignmentSettings,
  reveal: boolean,
  teacher?: { score: number | null; feedback: string | null; reviewedAt: Date | null },
): QuestionFeedback {
  const show = settings.showScores;
  const final = teacher?.score ?? earned;
  const correct = q.type === "short_answer" ? (final >= max - 1e-9 ? true : final <= 1e-9 ? false : null) : teacher?.score != null ? final >= max - 1e-9 : detail.correct;
  return {
    key: q.key,
    type: q.type,
    prompt: q.prompt,
    yourAnswer: displayAnswer(q, run, answer),
    correct: show ? correct : null,
    earned: show ? final : null,
    max,
    explanation: show && settings.showExplanations ? q.explanation || null : null,
    correctAnswer: reveal ? correctAnswerText(q) : null,
    note: show ? detail.note : undefined,
    concepts: show && detail.criteria ? detail.criteria.map((c) => ({ concept: c.concept, met: c.met })) : undefined,
    aiFeedback: show ? teacher?.feedback || detail.aiRationale : undefined,
    provisional: method !== "auto" && !teacher?.reviewedAt,
    reviewed: !!teacher?.reviewedAt,
  };
}

/** Per-question feedback mode: grade one question now and lock its answer. */
export async function checkQuestion(attempt: Attempt, runId: string, questionKey: string, answer: unknown) {
  const { run, section, settings } = await loadOwnRun(attempt, runId);
  if (settings.feedbackTiming !== "per_question") throw forbidden("Answers are checked when you submit the section.");
  if (run.status !== "in_progress") throw badRequest("This section was already submitted.");
  if (!run.questionKeys.includes(questionKey)) throw notFound("Question not found");
  const q = section.questions.find((x) => x.key === questionKey)!;
  let stored = run.draftAnswers[questionKey];
  if (!run.checkedKeys.includes(questionKey)) {
    const clean = sanitizeAnswer(q, answer);
    if (!isAnswered(q, clean)) throw badRequest("Answer the question first.");
    stored = clean;
    const db = await getDb();
    await db
      .update(schema.sectionRuns)
      .set({
        draftAnswers: sql`${schema.sectionRuns.draftAnswers} || ${JSON.stringify({ [questionKey]: clean })}::jsonb`,
        checkedKeys: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(${schema.sectionRuns.checkedKeys} || ${JSON.stringify([questionKey])}::jsonb) x)`,
      })
      .where(and(eq(schema.sectionRuns.id, runId), eq(schema.sectionRuns.status, "in_progress")));
  }
  const g = await gradeForRun(q, run, stored, false);
  return feedbackFor(q, run, stored, g.score, g.maxScore, g.detail, g.method, settings, true);
}

export async function submitSection(attempt: Attempt, runId: string, answers: Record<string, unknown>) {
  const { run, section, snapshot, settings } = await loadOwnRun(attempt, runId);
  if (run.status === "submitted") return getRunResult(attempt, runId); // idempotent: double-click / retry
  const db = await getDb();
  const [assignment] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, attempt.assignmentId));
  const open = openFor(attempt, assignment);
  if (!open.open) throw forbidden(open.reason);

  const byKey = new Map(section.questions.map((q) => [q.key, q]));
  const final: Record<string, Record<string, unknown> | null> = {};
  const missing: number[] = [];
  run.questionKeys.forEach((k, i) => {
    const q = byKey.get(k)!;
    const a = run.checkedKeys.includes(k) ? (run.draftAnswers[k] as Record<string, unknown>) : sanitizeAnswer(q, answers[k] ?? run.draftAnswers[k]);
    final[k] = a;
    if (!isAnswered(q, a)) missing.push(i + 1);
  });
  if (missing.length) {
    throw new HttpError(400, `Please answer every question before submitting. Still unanswered: ${missing.join(", ")}.`, "INCOMPLETE");
  }

  // Grade first (may call AI), then commit atomically only if still in progress.
  const graded = await Promise.all(
    run.questionKeys.map(async (k) => {
      const q = byKey.get(k)!;
      const g = await gradeForRun(q, run, final[k]);
      return { k, g };
    }),
  );
  const responseRows = graded.map(({ k, g }) => ({
    runId,
    questionKey: k,
    answer: final[k],
    autoScore: g.score,
    maxScore: g.maxScore,
    method: g.method,
    detail: g.detail,
    needsReview: g.needsReview,
  }));
  const passPercent = sectionPassPercent(settings, section.settings?.passPercent);
  const asLike = responseRows.map((r) => ({ ...r, teacherScore: null, reviewedAt: null }));
  const { score, max, percent } = runScoreFromResponses(asLike);
  const outcome = decideOutcome(settings, passPercent, asLike);

  const committed = await db.transaction(async (tx) => {
    const upd = await tx
      .update(schema.sectionRuns)
      .set({ status: "submitted", submittedAt: new Date(), score, maxScore: max, percent, outcome, draftAnswers: final })
      .where(and(eq(schema.sectionRuns.id, runId), eq(schema.sectionRuns.status, "in_progress")))
      .returning({ id: schema.sectionRuns.id });
    if (!upd.length) return false;
    await tx.insert(schema.responses).values(responseRows);
    return true;
  });
  if (committed) await refreshCompletion(attempt.id, snapshot);
  return getRunResult(attempt, runId);
}

/** Mark the attempt completed the first time every section is cleared. */
export async function refreshCompletion(attemptId: string, snapshot?: VersionSnapshot) {
  const db = await getDb();
  const [att] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId));
  if (!att || att.status === "completed") return;
  let snap = snapshot;
  if (!snap) {
    const [v] = await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.id, att.versionId));
    snap = v.snapshot;
  }
  const runs = await db.select().from(schema.sectionRuns).where(eq(schema.sectionRuns.attemptId, attemptId));
  const ids = runs.map((r) => r.id);
  const resp = ids.length ? await db.select().from(schema.responses).where(inArray(schema.responses.runId, ids)) : [];
  const sum = summarizeAttempt(snap, withDefaults(snap.settings), runs, resp);
  if (sum.allCleared) {
    await db.update(schema.attempts).set({ status: "completed", completedAt: new Date() }).where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.status, "in_progress")));
  }
}

export async function getRunResult(attempt: Attempt, runId: string) {
  const { run, section, settings } = await loadOwnRun(attempt, runId);
  if (run.status !== "submitted") throw badRequest("This section hasn't been submitted yet.");
  const db = await getDb();
  const [assignment] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, attempt.assignmentId));
  const resp = await db.select().from(schema.responses).where(eq(schema.responses.runId, runId));
  const byKey = new Map(section.questions.map((q) => [q.key, q]));
  const allRuns = await db.select().from(schema.sectionRuns).where(and(eq(schema.sectionRuns.attemptId, attempt.id), eq(schema.sectionRuns.sectionKey, run.sectionKey)));
  const sectionPassed = allRuns.some((r) => r.outcome === "passed");
  const reveal = canRevealAnswers(settings, { sectionPassed, assignmentClosed: !attempt.isPreview && assignmentOpenState(assignment).closed });
  const rmap = new Map(resp.map((r) => [r.questionKey, r]));
  const questions = run.questionKeys.map((k) => {
    const q = byKey.get(k)!;
    const r = rmap.get(k)!;
    return feedbackFor(q, run, r.answer, r.autoScore, r.maxScore, r.detail, r.method, settings, reveal, {
      score: r.teacherScore,
      feedback: r.teacherFeedback,
      reviewedAt: r.reviewedAt,
    });
  });
  const passPercent = sectionPassPercent(settings, section.settings?.passPercent);
  const show = settings.showScores;
  const correctCount = questions.filter((q) => q.correct === true).length;
  return {
    runId,
    sectionKey: run.sectionKey,
    sectionTitle: section.title,
    runNumber: run.runNumber,
    practice: !run.countsForGrade,
    outcome: run.outcome,
    percent: show ? run.percent : null,
    score: show ? run.score : null,
    maxScore: run.maxScore,
    correctCount: show ? correctCount : null,
    total: questions.length,
    passPercent,
    answersRevealed: reveal,
    questions,
  };
}

export async function heartbeat(attempt: Attempt) {
  const db = await getDb();
  // Count at most 35 seconds per heartbeat, measured on the server.
  await db
    .update(schema.attempts)
    .set({
      activeSeconds: sql`${schema.attempts.activeSeconds} + least(35, greatest(0, extract(epoch from (now() - ${schema.attempts.lastActiveAt}))))::int`,
      lastActiveAt: new Date(),
    })
    .where(eq(schema.attempts.id, attempt.id));
}

// ───────────── teacher preview ─────────────

/** Fresh preview attempt built from the CURRENT DRAFT. Replaces any earlier preview. */
export async function createPreviewAttempt(assignmentId: string, snapshot: VersionSnapshot) {
  const db = await getDb();
  await db.delete(schema.attempts).where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.isPreview, true)));
  await db.delete(schema.assignmentVersions).where(and(eq(schema.assignmentVersions.assignmentId, assignmentId), eq(schema.assignmentVersions.isPreview, true)));
  const [v] = await db
    .insert(schema.assignmentVersions)
    .values({ assignmentId, versionNumber: -1 - randomInt(1_000_000_000), snapshot, isPreview: true })
    .returning();
  const [att] = await db
    .insert(schema.attempts)
    .values({ assignmentId, versionId: v.id, periodId: null, studentName: "Teacher Preview", studentKey: "__preview__", tokenHash: sha256(randomToken()), resumeCode: "PREVIEW", isPreview: true })
    .returning();
  return att;
}

export async function getPreviewAttempt(assignmentId: string) {
  const db = await getDb();
  const [att] = await db.select().from(schema.attempts).where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.isPreview, true)));
  return att ?? null;
}
