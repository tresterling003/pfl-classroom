import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { toCsv } from "../csv";
import { getAssignmentResults } from "./results";
import { ownedCourse } from "./access";

const COMPLETION_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const PASSING_LABEL = { passed: "Passed all sections", pending_review: "Pending teacher review", not_passed: "Not yet passed" } as const;

/** Gradebook CSV for one assignment (optionally one period). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function resultsCsv(teacherId: string, assignmentId: string, opts: { periodId?: string; timeZone?: string } = {}) {
  const { rows } = await getAssignmentResults(teacherId, assignmentId, opts);
  const sectionTitles = rows[0]?.sections.map((s) => s.title) ?? [];
  const header = [
    "Student",
    "Period",
    "Completion",
    "Passing Status",
    ...sectionTitles.map((t, i) => `S${i + 1} ${t} (%)`),
    ...sectionTitles.map((t, i) => `S${i + 1} Tries`),
    "Raw Points",
    "Points Possible",
    "Suggested Grade (%)",
    "Teacher-Approved Grade (%)",
    "Gradebook Grade",
    "Grade Source",
    "Needs Review",
    "Missing Sections",
    "Time Spent (min)",
    "Started",
    "Completed",
  ];
  const timeZone = safeTimeZone(opts.timeZone);
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short", timeZone }) : "");
  const body = rows
    .sort((a, b) => a.periodName.localeCompare(b.periodName) || a.studentName.localeCompare(b.studentName))
    .map((r) => [
      r.studentName,
      r.periodName,
      COMPLETION_LABEL[r.completion],
      PASSING_LABEL[r.passing],
      ...r.sections.map((s) => (s.percent == null ? "" : Math.round(s.percent * 10) / 10)),
      ...r.sections.map((s) => s.runs),
      Math.round(r.suggestedPoints * 10) / 10,
      r.totalPoints,
      r.suggestedPercent,
      r.approvedGrade ?? "",
      r.gradebookGrade,
      r.gradebookSource === "approved" ? "Teacher approved" : r.provisional ? "Suggested (provisional)" : "Suggested",
      r.pendingReview > 0 ? `Yes (${r.pendingReview})` : "No",
      r.missingSections.join("; "),
      Math.round(r.activeSeconds / 6) / 10,
      fmt(r.startedAt),
      fmt(r.completedAt),
    ]);
  return toCsv([header, ...body]);
}

/** Full JSON backup of a class: units, periods, question bank, assignments, versions and student work. */
export async function courseBackup(teacherId: string, courseId: string, includeStudentWork: boolean) {
  const course = await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const units = await db.select().from(schema.units).where(eq(schema.units.courseId, courseId));
  const periods = await db.select().from(schema.periods).where(eq(schema.periods.courseId, courseId));
  const questions = await db.select().from(schema.questions).where(eq(schema.questions.courseId, courseId));
  const assignments = await db.select().from(schema.assignments).where(eq(schema.assignments.courseId, courseId)).orderBy(asc(schema.assignments.createdAt));
  const aIds = assignments.map((a) => a.id);
  const sections = aIds.length ? await db.select().from(schema.assignmentSections).where(inArray(schema.assignmentSections.assignmentId, aIds)) : [];
  const sIds = sections.map((s) => s.id);
  const sectionQuestions = sIds.length ? await db.select().from(schema.sectionQuestions).where(inArray(schema.sectionQuestions.sectionId, sIds)) : [];
  const assignmentPeriods = aIds.length ? await db.select().from(schema.assignmentPeriods).where(inArray(schema.assignmentPeriods.assignmentId, aIds)) : [];
  const versions = aIds.length
    ? await db.select().from(schema.assignmentVersions).where(and(inArray(schema.assignmentVersions.assignmentId, aIds), eq(schema.assignmentVersions.isPreview, false)))
    : [];
  let work: Record<string, unknown> = {};
  if (includeStudentWork && aIds.length) {
    const attempts = (await db.select().from(schema.attempts).where(and(inArray(schema.attempts.assignmentId, aIds), eq(schema.attempts.isPreview, false)))).map(({ tokenHash: _t, ...a }) => a);
    const atIds = attempts.map((a) => a.id);
    const runs = atIds.length ? await db.select().from(schema.sectionRuns).where(inArray(schema.sectionRuns.attemptId, atIds)) : [];
    const rIds = runs.map((r) => r.id);
    const responses = rIds.length ? await db.select().from(schema.responses).where(inArray(schema.responses.runId, rIds)) : [];
    work = { attempts, runs, responses };
  }
  return {
    format: "pfl-classroom-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    course,
    units,
    periods,
    questions,
    assignments,
    sections,
    sectionQuestions,
    assignmentPeriods,
    versions,
    ...work,
  };
}
