import "server-only";
import { getDb, schema } from "@/db";
import { createAssignment } from "../services/assignments";
import { createCourse, createUnit } from "../services/courses";
import { ECON_REVIEW_DIRECTIONS, ECON_REVIEW_TITLE, FILL_BLANK, MATCHING, MULTIPLE_CHOICE, SHORT_ANSWER, type SeedQuestion } from "./economics-review";
import { asc, eq } from "drizzle-orm";

/**
 * Creates the teacher's starter classroom:
 *  - "PFL / Economics" with sample periods, a unit, a 40-question bank and the Unit Review (as a draft)
 *  - two empty example classes, which can be renamed or deleted
 */
export async function seedStarterContent(teacherId: string, opts: { extraCourses?: boolean } = {}) {
  const db = await getDb();
  const course = await createCourse(teacherId, {
    name: "PFL / Economics",
    description: "Personal Financial Literacy & Economics",
    color: "emerald",
    periods: ["1st Period", "2nd Period", "3rd Period", "4th Period"],
  });
  const unit = await createUnit(teacherId, course.id, "Markets, Circular Flow & Supply/Demand");

  const insert = async (qs: SeedQuestion[]) => {
    const rows = await db
      .insert(schema.questions)
      .values(qs.map((q) => ({ courseId: course.id, unitId: unit.id, type: q.data.type, prompt: q.prompt, data: q.data, explanation: q.explanation, topic: q.topic, difficulty: q.difficulty, points: q.points })))
      .returning({ id: schema.questions.id });
    return rows.map((r) => r.id);
  };
  const ids = [await insert(MATCHING), await insert(FILL_BLANK), await insert(MULTIPLE_CHOICE), await insert(SHORT_ANSWER)];

  const a = await createAssignment(teacherId, course.id, {
    title: ECON_REVIEW_TITLE,
    kind: "review",
    unitId: unit.id,
    template: "four_sections",
    directions: ECON_REVIEW_DIRECTIONS,
  });
  const sections = await db.select().from(schema.assignmentSections).where(eq(schema.assignmentSections.assignmentId, a.id)).orderBy(asc(schema.assignmentSections.sortOrder));
  for (let i = 0; i < sections.length; i++) {
    await db.insert(schema.sectionQuestions).values(ids[i].map((questionId, j) => ({ sectionId: sections[i].id, questionId, sortOrder: j })));
  }

  if (opts.extraCourses !== false) {
    await createCourse(teacherId, { name: "Principles of A/V Technology", color: "sky" });
    await createCourse(teacherId, { name: "Digital Arts & Animation", color: "violet" });
  }
  return { courseId: course.id, assignmentId: a.id };
}
