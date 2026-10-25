/**
 * Pure scoring/progression logic shared by the student player and the teacher gradebook.
 * Keeps the important distinction explicit:
 *   passing a section (unlocks the next one)  ≠  the grade the section earns.
 */
import type { AssignmentSettings, VersionSnapshot } from "./types";

export interface RunLike {
  id: string;
  sectionKey: string;
  runNumber: number;
  status: "in_progress" | "submitted";
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  outcome: "passed" | "failed" | "provisional" | null;
  countsForGrade: boolean;
  submittedAt: Date | string | null;
}

export interface ResponseLike {
  runId: string;
  questionKey: string;
  autoScore: number;
  maxScore: number;
  method: "auto" | "rubric" | "ai";
  needsReview: boolean;
  teacherScore: number | null;
  reviewedAt: Date | string | null;
}

export type SectionStatus = "locked" | "available" | "in_progress" | "passed" | "provisional" | "failed" | "exhausted";

export interface SectionSummary {
  key: string;
  title: string;
  index: number;
  status: SectionStatus;
  passPercent: number;
  weight: number;
  /** Percent of the run chosen for the grade (null = not attempted). */
  percent: number | null;
  points: number;
  gradedRunId: string | null;
  runsSubmitted: number;
  gradedRunsUsed: number;
  canRetry: boolean;
  /** Next run would be practice only (graded runs used up). */
  nextRunIsPractice: boolean;
  bestPercent: number | null;
  pendingReview: number;
  provisional: boolean;
  cleared: boolean;
  questionCount: number;
}

export interface AttemptSummary {
  sections: SectionSummary[];
  completion: "not_started" | "in_progress" | "completed";
  passing: "passed" | "pending_review" | "not_passed";
  suggestedPoints: number;
  totalPoints: number;
  suggestedPercent: number;
  provisional: boolean;
  pendingReview: number;
  allCleared: boolean;
}

export function sectionPassPercent(settings: AssignmentSettings, sectionPass?: number | null) {
  return sectionPass ?? settings.passPercent;
}

/** Score of a run from its responses, honoring teacher overrides. */
export function runScoreFromResponses(responses: ResponseLike[]) {
  let score = 0;
  let max = 0;
  for (const r of responses) {
    score += r.teacherScore ?? r.autoScore;
    max += r.maxScore;
  }
  return { score, max, percent: max > 0 ? (score / max) * 100 : 0 };
}

/** Decide passed / provisional / failed for a just-graded (or re-graded) run. */
export function decideOutcome(
  settings: AssignmentSettings,
  passPercent: number,
  responses: ResponseLike[],
): "passed" | "failed" | "provisional" {
  const { score, max, percent } = runScoreFromResponses(responses);
  if (percent + 1e-9 >= passPercent) return "passed";
  if (settings.shortAnswerProgression === "provisional" && max > 0) {
    const pending = responses.filter((r) => r.needsReview && !r.reviewedAt && r.method !== "auto");
    const potential = pending.reduce((s, r) => s + (r.maxScore - (r.teacherScore ?? r.autoScore)), 0);
    if (pending.length && ((score + potential) / max) * 100 + 1e-9 >= passPercent) return "provisional";
  }
  return "failed";
}

function sectionQuestionCount(sec: VersionSnapshot["sections"][number]) {
  const draw = sec.settings?.drawCount ?? 0;
  return draw && draw < sec.questions.length ? draw : sec.questions.length;
}

export function summarizeAttempt(
  snapshot: VersionSnapshot,
  settings: AssignmentSettings,
  runs: RunLike[],
  responses: ResponseLike[],
): AttemptSummary {
  const nSec = snapshot.sections.length;
  const sectionMax = snapshot.sections.map((s) => {
    const count = sectionQuestionCount(s);
    const avg = s.questions.reduce((a, q) => a + q.points, 0) / Math.max(1, s.questions.length);
    return count * avg;
  });
  const allMax = sectionMax.reduce((a, b) => a + b, 0) || 1;
  const respByRun = new Map<string, ResponseLike[]>();
  for (const r of responses) {
    if (!respByRun.has(r.runId)) respByRun.set(r.runId, []);
    respByRun.get(r.runId)!.push(r);
  }

  const sections: SectionSummary[] = [];
  let prevCleared = true;
  for (let i = 0; i < nSec; i++) {
    const sec = snapshot.sections[i];
    const passPercent = sectionPassPercent(settings, sec.settings?.passPercent);
    const weight = settings.sectionWeighting === "points" ? (settings.totalPoints * sectionMax[i]) / allMax : settings.totalPoints / Math.max(1, nSec);
    const mine = runs.filter((r) => r.sectionKey === sec.key).sort((a, b) => a.runNumber - b.runNumber);
    const submitted = mine.filter((r) => r.status === "submitted");
    const graded = submitted.filter((r) => r.countsForGrade);
    const inProgress = mine.find((r) => r.status === "in_progress");

    let chosen: RunLike | undefined;
    if (graded.length) {
      if (settings.gradeBasis === "first") chosen = graded[0];
      else if (settings.gradeBasis === "latest") chosen = graded[graded.length - 1];
      else chosen = graded.reduce((best, r) => ((r.percent ?? 0) > (best.percent ?? 0) ? r : best), graded[0]);
    }
    const passed = submitted.some((r) => r.outcome === "passed");
    const provisional = !passed && submitted.some((r) => r.outcome === "provisional");
    const gradedUsed = graded.length;
    const limit = settings.maxGradedRuns;
    const gradedLeft = limit === 0 || gradedUsed < limit;
    const canRetry = gradedLeft || settings.allowPracticeAfterLimit;
    const exhausted = !passed && !provisional && submitted.length > 0 && !canRetry;
    // Once a student has moved past a section we never re-lock it, even if a teacher review lowers a score.
    const startedLater = runs.some((r) => snapshot.sections.findIndex((s) => s.key === r.sectionKey) > i);
    const cleared = passed || provisional || exhausted || (startedLater && submitted.length > 0);

    const locked = settings.sequential && !prevCleared && mine.length === 0;
    let status: SectionStatus;
    if (locked) status = "locked";
    else if (inProgress) status = "in_progress";
    else if (passed) status = "passed";
    else if (provisional) status = "provisional";
    else if (exhausted) status = "exhausted";
    else if (submitted.length) status = "failed";
    else status = "available";

    const chosenResponses = chosen ? respByRun.get(chosen.id) ?? [] : [];
    const pendingReview = chosenResponses.filter((r) => r.needsReview && !r.reviewedAt).length;
    const unreviewedAuto = chosenResponses.some((r) => r.method !== "auto" && !r.reviewedAt && r.teacherScore == null);
    const percent = chosen ? chosen.percent ?? 0 : null;
    sections.push({
      key: sec.key,
      title: sec.title,
      index: i,
      status,
      passPercent,
      weight,
      percent,
      points: percent == null ? 0 : (weight * percent) / 100,
      gradedRunId: chosen?.id ?? null,
      runsSubmitted: submitted.length,
      gradedRunsUsed: gradedUsed,
      canRetry,
      nextRunIsPractice: !gradedLeft,
      bestPercent: submitted.length ? Math.max(...submitted.map((r) => r.percent ?? 0)) : null,
      pendingReview,
      provisional: unreviewedAuto || pendingReview > 0,
      cleared,
      questionCount: sectionQuestionCount(sec),
    });
    prevCleared = cleared;
  }

  const allCleared = sections.length > 0 && sections.every((s) => s.cleared);
  const anyRun = runs.length > 0;
  const suggestedPoints = sections.reduce((a, s) => a + s.points, 0);
  const pendingReview = sections.reduce((a, s) => a + s.pendingReview, 0);
  const allPassed = sections.length > 0 && sections.every((s) => s.status === "passed");
  const anyProvisional = sections.some((s) => s.status === "provisional");
  return {
    sections,
    completion: allCleared ? "completed" : anyRun ? "in_progress" : "not_started",
    passing: allPassed ? "passed" : anyProvisional || (allCleared && pendingReview > 0) ? "pending_review" : "not_passed",
    suggestedPoints: Math.round(suggestedPoints * 100) / 100,
    totalPoints: settings.totalPoints,
    suggestedPercent: Math.round((suggestedPoints / settings.totalPoints) * 1000) / 10,
    provisional: sections.some((s) => s.provisional),
    pendingReview,
    allCleared,
  };
}

/** Can the student see the correct answers for a run right now? */
export function canRevealAnswers(
  settings: AssignmentSettings,
  ctx: { sectionPassed: boolean; assignmentClosed: boolean },
): boolean {
  if (!settings.showScores) return false;
  switch (settings.showCorrectAnswers) {
    case "always":
      return true;
    case "after_pass":
      return ctx.sectionPassed || ctx.assignmentClosed;
    case "after_close":
      return ctx.assignmentClosed;
    default:
      return false;
  }
}
