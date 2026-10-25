import { requireTeacherPage } from "@/lib/auth";
import { ownedCourse } from "@/lib/services/access";
import { listPeriods, listUnits } from "@/lib/services/courses";
import { ClassSettingsClient } from "./ClassSettingsClient";

export const metadata = { title: "Class settings" };

export default async function ClassSettings({ params }: { params: Promise<{ courseId: string }> }) {
  const t = await requireTeacherPage();
  const { courseId } = await params;
  const course = await ownedCourse(t.id, courseId);
  const [periods, units] = await Promise.all([listPeriods(courseId, true), listUnits(courseId)]);
  return (
    <ClassSettingsClient
      course={{ id: course.id, name: course.name, description: course.description, color: course.color, archived: !!course.archivedAt }}
      periods={periods.map((p) => ({ id: p.id, name: p.name, archived: !!p.archivedAt }))}
      units={units.map((u) => ({ id: u.id, name: u.name, archived: !!u.archivedAt }))}
    />
  );
}
