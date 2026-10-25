import { notFound } from "next/navigation";
import { requireTeacherPage } from "@/lib/auth";
import { getAssignmentDetail } from "@/lib/services/assignments";
import { listCourses, listPeriods, listUnits } from "@/lib/services/courses";
import { listQuestions } from "@/lib/services/questions";
import { BuilderClient } from "./BuilderClient";
import { aiConfigured } from "@/lib/grading/ai";

export const metadata = { title: "Edit assignment" };

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacherPage();
  const { id } = await params;
  const d = await getAssignmentDetail(t.id, id).catch(() => null);
  if (!d) notFound();
  const [units, periods, bank, courses] = await Promise.all([listUnits(d.course.id), listPeriods(d.course.id), listQuestions(t.id, d.course.id), listCourses(t.id)]);
  // Dates become strings when sent to the browser.
  const ser = (x: unknown) => JSON.parse(JSON.stringify(x));
  return (
    <BuilderClient
      detail={ser(d)}
      units={units.filter((u) => !u.archivedAt).map((u) => ({ id: u.id, name: u.name }))}
      periods={periods.map((p) => ({ id: p.id, name: p.name }))}
      bank={ser(bank)}
      courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      aiOn={aiConfigured()}
    />
  );
}
