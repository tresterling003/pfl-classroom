import { requireTeacherPage } from "@/lib/auth";
import { ownedCourse } from "@/lib/services/access";
import { notFound } from "next/navigation";
import { ClassTabs } from "./ClassTabs";
import { PageHeader } from "@/components/teacher/PageHeader";
import { Badge } from "@/components/ui";

export default async function ClassLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const t = await requireTeacherPage();
  const { courseId } = await params;
  const course = await ownedCourse(t.id, courseId).catch(() => null);
  if (!course) notFound();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ href: "/teacher/classes", label: "Classes" }]}
        title={
          <span className="flex items-center gap-3">
            {course.name} {course.archivedAt && <Badge>Archived</Badge>}
          </span>
        }
        sub={course.description || undefined}
      />
      <ClassTabs courseId={course.id} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
