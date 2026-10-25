import { requireTeacherPage } from "@/lib/auth";
import { listCourses, listUnits } from "@/lib/services/courses";
import { listQuestions, questionUsage } from "@/lib/services/questions";
import { BankClient } from "./BankClient";

export const metadata = { title: "Question bank" };

export default async function BankPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ archived?: string }> }) {
  const t = await requireTeacherPage();
  const { courseId } = await params;
  const archived = (await searchParams).archived === "1";
  const [questions, units, courses] = await Promise.all([listQuestions(t.id, courseId, { archived }), listUnits(courseId), listCourses(t.id)]);
  const usage = await questionUsage(questions.map((q) => q.id));
  return (
    <BankClient
      courseId={courseId}
      archived={archived}
      units={units.map((u) => ({ id: u.id, name: u.name }))}
      courses={courses.filter((c) => c.id !== courseId).map((c) => ({ id: c.id, name: c.name }))}
      questions={questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        data: q.data,
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty,
        points: q.points,
        unitId: q.unitId,
        usedIn: usage.get(q.id) ?? [],
      }))}
    />
  );
}
