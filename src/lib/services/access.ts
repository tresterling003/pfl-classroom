/** Ownership checks — every teacher-side read/write goes through one of these. */
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { notFound } from "../http";

export async function ownedCourse(teacherId: string, courseId: string) {
  const db = await getDb();
  if (!isUuid(courseId)) throw notFound("Class not found");
  const [c] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.teacherId, teacherId)));
  if (!c) throw notFound("Class not found");
  return c;
}

export async function ownedAssignment(teacherId: string, assignmentId: string) {
  const db = await getDb();
  if (!isUuid(assignmentId)) throw notFound("Assignment not found");
  const [row] = await db
    .select({ a: schema.assignments, c: schema.courses })
    .from(schema.assignments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw notFound("Assignment not found");
  return { assignment: row.a, course: row.c };
}

export async function ownedQuestion(teacherId: string, questionId: string) {
  const db = await getDb();
  if (!isUuid(questionId)) throw notFound("Question not found");
  const [row] = await db
    .select({ q: schema.questions })
    .from(schema.questions)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.questions.courseId))
    .where(and(eq(schema.questions.id, questionId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw notFound("Question not found");
  return row.q;
}

export async function ownedSection(teacherId: string, sectionId: string) {
  const db = await getDb();
  if (!isUuid(sectionId)) throw notFound("Section not found");
  const [row] = await db
    .select({ s: schema.assignmentSections, a: schema.assignments })
    .from(schema.assignmentSections)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSections.assignmentId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(and(eq(schema.assignmentSections.id, sectionId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw notFound("Section not found");
  return { section: row.s, assignment: row.a };
}

export async function ownedAttempt(teacherId: string, attemptId: string) {
  const db = await getDb();
  if (!isUuid(attemptId)) throw notFound("Submission not found");
  const [row] = await db
    .select({ t: schema.attempts, a: schema.assignments })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.courses.teacherId, teacherId)));
  if (!row) throw notFound("Submission not found");
  return { attempt: row.t, assignment: row.a };
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s ?? "");
}
