/** Class gradebook: every student × every assignment in one class. */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ownedCourse } from "./access";
import { getAssignmentResults } from "./results";
import { toCsv } from "../csv";

export async function courseGradebook(teacherId: string, courseId: string, periodId?: string) {
  const course = await ownedCourse(teacherId, courseId);
  const db = await getDb();
  const assignments = await db
    .select()
    .from(schema.assignments)
    .where(and(eq(schema.assignments.courseId, courseId), isNull(schema.assignments.archivedAt)))
    .orderBy(asc(schema.assignments.sortOrder), asc(schema.assignments.createdAt));
  const published = assignments.filter((a) => a.currentVersionId);
  const periods = await db.select().from(schema.periods).where(eq(schema.periods.courseId, courseId)).orderBy(asc(schema.periods.sortOrder));
  const students = new Map<string, { name: string; periodName: string; grades: Record<string, { grade: number; source: string; completion: string; attemptId: string }> }>();
  for (const a of published) {
    const { rows } = await getAssignmentResults(teacherId, a.id, { periodId });
    for (const r of rows) {
      const key = `${r.periodId ?? ""}|${r.studentName.toLowerCase()}`;
      if (!students.has(key)) students.set(key, { name: r.studentName, periodName: r.periodName, grades: {} });
      students.get(key)!.grades[a.id] = { grade: r.gradebookGrade, source: r.gradebookSource, completion: r.completion, attemptId: r.attemptId };
    }
  }
  const list = [...students.values()].sort((a, b) => a.periodName.localeCompare(b.periodName) || a.name.localeCompare(b.name));
  return { course, periods, assignments: published.map((a) => ({ id: a.id, title: a.title, status: a.status })), students: list };
}

export async function courseGradebookCsv(teacherId: string, courseId: string, periodId?: string) {
  const g = await courseGradebook(teacherId, courseId, periodId);
  const header = ["Student", "Period", ...g.assignments.map((a) => a.title)];
  const rows = g.students.map((s) => [s.name, s.periodName, ...g.assignments.map((a) => s.grades[a.id]?.grade ?? "")]);
  const period = periodId ? g.periods.find((p) => p.id === periodId)?.name : "all-periods";
  const filename = `${g.course.name}-${period ?? "period"}-gradebook.csv`.replace(/[^a-z0-9.\-]+/gi, "-");
  return { csv: toCsv([header, ...rows]), filename };
}
