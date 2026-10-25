/**
 * Database schema.
 *
 * Hierarchy:  Teacher → Course (class) → Unit → Assignment → Section → Question
 *
 * - Questions live in a per-course QUESTION BANK. Draft assignments reference
 *   bank questions through `section_questions`.
 * - Publishing an assignment freezes a complete copy of its sections + questions
 *   (including answer keys) into `assignment_versions.snapshot`. Students are
 *   always graded against a frozen version, so editing the bank or the draft
 *   never changes historical grades.
 * - Student work: attempts (one per student per assignment) → section_runs
 *   (each try at a section) → responses (one per question per run).
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AssignmentSettings,
  QuestionData,
  SectionSettings,
  VersionSnapshot,
  GradeDetail,
} from "@/lib/types";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────────── Teachers & sessions ─────────────────────────────

export const teachers = pgTable("teachers", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const teacherSessions = pgTable(
  "teacher_sessions",
  {
    // sha256 of the random cookie token; the raw token is never stored.
    tokenHash: text("token_hash").primaryKey(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("teacher_sessions_teacher_idx").on(t.teacherId)],
);

// ───────────────────────────── Courses, units, periods ─────────────────────────────

export const courses = pgTable(
  "courses",
  {
    id: id(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("indigo"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("courses_teacher_idx").on(t.teacherId)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("units_course_idx").on(t.courseId)],
);

export const periods = pgTable(
  "periods",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("periods_course_idx").on(t.courseId)],
);

// ───────────────────────────── Question bank ─────────────────────────────

export const questions = pgTable(
  "questions",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    type: text("type").$type<QuestionData["type"]>().notNull(),
    prompt: text("prompt").notNull(),
    /** Type-specific content: choices, answers, rubric… see QuestionData. */
    data: jsonb("data").$type<QuestionData>().notNull(),
    explanation: text("explanation").notNull().default(""),
    topic: text("topic").notNull().default(""),
    difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull().default("medium"),
    points: real("points").notNull().default(1),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("questions_course_idx").on(t.courseId)],
);

// ───────────────────────────── Assignments (draft structure) ─────────────────────────────

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    kind: text("kind").$type<"review" | "quiz" | "practice" | "test">().notNull().default("review"),
    directions: text("directions").notNull().default(""),
    settings: jsonb("settings").$type<AssignmentSettings>().notNull(),
    /** draft = never published; published = students can join (within dates); closed = no new work. */
    status: text("status").$type<"draft" | "published" | "closed">().notNull().default("draft"),
    joinCode: text("join_code").notNull().unique(),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    currentVersionId: uuid("current_version_id"),
    /** true when the draft has edits that are not yet in the published version. */
    hasUnpublishedChanges: boolean("has_unpublished_changes").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assignments_course_idx").on(t.courseId)],
);

export const assignmentSections = pgTable(
  "assignment_sections",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    settings: jsonb("settings").$type<SectionSettings>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("sections_assignment_idx").on(t.assignmentId)],
);

export const sectionQuestions = pgTable(
  "section_questions",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => assignmentSections.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.questionId] })],
);

export const assignmentPeriods = pgTable(
  "assignment_periods",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.periodId] })],
);

/** Frozen, immutable published copies. Never updated after insert. */
export const assignmentVersions = pgTable(
  "assignment_versions",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    snapshot: jsonb("snapshot").$type<VersionSnapshot>().notNull(),
    /** Temporary copy used for the teacher's "Preview as student". Never shown to students. */
    isPreview: boolean("is_preview").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("versions_assignment_num_idx").on(t.assignmentId, t.versionNumber)],
);

// ───────────────────────────── Student work ─────────────────────────────

export const attempts = pgTable(
  "attempts",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => assignmentVersions.id, { onDelete: "cascade" }),
    periodId: uuid("period_id").references(() => periods.id, { onDelete: "set null" }),
    studentName: text("student_name").notNull(),
    /** lower-cased, whitespace-collapsed — used to detect the same student re-joining. */
    studentKey: text("student_key").notNull(),
    /** sha256 of the browser's secret attempt token (httpOnly cookie). */
    tokenHash: text("token_hash").notNull(),
    /** Short code shown to the student so they can resume on another device. Teacher can see it. */
    resumeCode: text("resume_code").notNull(),
    status: text("status").$type<"in_progress" | "completed">().notNull().default("in_progress"),
    activeSeconds: integer("active_seconds").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Teacher-approved final grade (0-100). Null until the teacher approves or overrides. */
    approvedGrade: real("approved_grade"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    teacherNote: text("teacher_note").notNull().default(""),
    /** Teacher preview attempt — excluded from all results. */
    isPreview: boolean("is_preview").notNull().default(false),
  },
  (t) => [
    index("attempts_assignment_idx").on(t.assignmentId),
    uniqueIndex("attempts_student_unique").on(t.assignmentId, t.periodId, t.studentKey),
  ],
);

export const sectionRuns = pgTable(
  "section_runs",
  {
    id: id(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    /** The section's key inside the frozen version snapshot. */
    sectionKey: text("section_key").notNull(),
    runNumber: integer("run_number").notNull(),
    /** Question keys served in this run (supports random draws), in display order. */
    questionKeys: jsonb("question_keys").$type<string[]>().notNull(),
    /** Per-question shuffle orders so a refresh shows the same layout. */
    layout: jsonb("layout").$type<Record<string, string[]>>().notNull().default({}),
    status: text("status").$type<"in_progress" | "submitted">().notNull().default("in_progress"),
    draftAnswers: jsonb("draft_answers").$type<Record<string, unknown>>().notNull().default({}),
    /** Client-supplied, increasing save counter; older (out-of-order) saves are ignored. */
    draftRevision: bigint("draft_revision", { mode: "number" }).notNull().default(0),
    /** Questions already checked one-at-a-time (per-question feedback mode); their answers are locked. */
    checkedKeys: jsonb("checked_keys").$type<string[]>().notNull().default([]),
    score: real("score"),
    maxScore: real("max_score"),
    percent: real("percent"),
    /** passed | failed | provisional (short answers awaiting teacher review) */
    outcome: text("outcome").$type<"passed" | "failed" | "provisional">(),
    countsForGrade: boolean("counts_for_grade").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_attempt_idx").on(t.attemptId),
    uniqueIndex("runs_attempt_section_num").on(t.attemptId, t.sectionKey, t.runNumber),
  ],
);

export const responses = pgTable(
  "responses",
  {
    id: id(),
    runId: uuid("run_id")
      .notNull()
      .references(() => sectionRuns.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    answer: jsonb("answer").$type<unknown>(),
    autoScore: real("auto_score").notNull(),
    maxScore: real("max_score").notNull(),
    /** auto = deterministic (MC/matching/FIB); rubric = keyword fallback; ai = AI suggestion */
    method: text("method").$type<"auto" | "rubric" | "ai">().notNull(),
    /** Grading details shown as feedback (missing concepts, matched variant…). */
    detail: jsonb("detail").$type<GradeDetail>().notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    teacherScore: real("teacher_score"),
    teacherFeedback: text("teacher_feedback"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("responses_run_idx").on(t.runId),
    uniqueIndex("responses_run_question").on(t.runId, t.questionKey),
  ],
);

// ───────────────────────────── Abuse protection ─────────────────────────────

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
