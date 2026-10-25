import { requireTeacherPage } from "@/lib/auth";
import { courseCounts, listCourses, listPeriods } from "@/lib/services/courses";
import { ClassesClient } from "./ClassesClient";

export const metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const t = await requireTeacherPage();
  const courses = await listCourses(t.id, { includeArchived: true });
  const counts = await courseCounts(courses.map((c) => c.id));
  const periods = new Map<string, number>();
  for (const c of courses) periods.set(c.id, (await listPeriods(c.id)).length);
  const sp = await searchParams;
  return (
    <ClassesClient
      startOpen={sp.new === "1"}
      courses={courses.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        color: c.color,
        archived: !!c.archivedAt,
        assignments: counts.get(c.id)?.assignments ?? 0,
        questions: counts.get(c.id)?.questions ?? 0,
        periods: periods.get(c.id) ?? 0,
      }))}
    />
  );
}
