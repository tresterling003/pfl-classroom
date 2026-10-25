import { requireTeacherPage } from "@/lib/auth";
import { listCourses } from "@/lib/services/courses";
import { AppProviders } from "@/components/ui";
import { TeacherNav } from "@/components/teacher/TeacherNav";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacher = await requireTeacherPage();
  const courses = await listCourses(teacher.id);
  return (
    <AppProviders>
      <div className="min-h-screen lg:flex">
        <TeacherNav teacherName={teacher.name} courses={courses.map((c) => ({ id: c.id, name: c.name, color: c.color }))} />
        <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-8">{children}</main>
      </div>
    </AppProviders>
  );
}
