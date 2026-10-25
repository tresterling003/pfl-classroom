import { requireTeacherPage } from "@/lib/auth";
import { listAssignments } from "@/lib/services/assignments";
import { listCourses, listUnits } from "@/lib/services/courses";
import { AssignmentsClient } from "./AssignmentsClient";

export const metadata = { title: "Assignments" };

export default async function ClassAssignments({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ archived?: string }> }) {
  const t = await requireTeacherPage();
  const { courseId } = await params;
  const archived = (await searchParams).archived === "1";
  const [assignments, units, courses] = await Promise.all([listAssignments(t.id, courseId, { archived }), listUnits(courseId), listCourses(t.id)]);
  return (
    <AssignmentsClient
      courseId={courseId}
      archived={archived}
      units={units.filter((u) => !u.archivedAt).map((u) => ({ id: u.id, name: u.name }))}
      courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      assignments={assignments.map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        status: a.status,
        joinCode: a.joinCode,
        unitId: a.unitId,
        closesAt: a.closesAt?.toISOString() ?? null,
        archived: !!a.archivedAt,
        hasUnpublishedChanges: a.hasUnpublishedChanges && !!a.currentVersionId,
        started: a.stats.started,
        completed: a.stats.completed,
      }))}
    />
  );
}
