import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth";
import { courseGradebook } from "@/lib/services/gradebook";
import { Button, Card, EmptyState } from "@/components/ui";
import { PeriodSelect } from "./PeriodSelect";

export const metadata = { title: "Gradebook" };

export default async function GradebookPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ period?: string }> }) {
  const t = await requireTeacherPage();
  const { courseId } = await params;
  const { period } = await searchParams;
  const g = await courseGradebook(t.id, courseId, period || undefined);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-600">Gradebook grade for every published assignment: your approved grade when set, otherwise the suggested grade (marked *).</p>
        <div className="flex gap-2">
          <PeriodSelect periods={g.periods.map((p) => ({ id: p.id, name: p.name }))} value={period ?? ""} />
          <a href={`/api/teacher/courses/${courseId}/gradebook?format=csv${period ? `&period=${period}` : ""}`}><Button>⬇ Export CSV</Button></a>
        </div>
      </div>
      {g.assignments.length === 0 || g.students.length === 0 ? (
        <EmptyState title="No grades yet">Grades appear here once students work on published assignments.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="sticky left-0 bg-white px-3 py-3">Student</th>
                <th className="px-3 py-3">Period</th>
                {g.assignments.map((a) => (
                  <th key={a.id} className="max-w-40 px-3 py-3 text-right normal-case tracking-normal">
                    <Link href={`/teacher/assignments/${a.id}/results`} className="line-clamp-2 hover:text-brand-700">{a.title}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.students.map((s, i) => (
                <tr key={i} className="border-b border-ink-50 last:border-0">
                  <td className="sticky left-0 bg-white px-3 py-2 font-semibold text-ink-900">{s.name}</td>
                  <td className="px-3 py-2 text-ink-600">{s.periodName}</td>
                  {g.assignments.map((a) => {
                    const x = s.grades[a.id];
                    return (
                      <td key={a.id} className="px-3 py-2 text-right tabular-nums">
                        {x ? (
                          <Link href={`/teacher/attempts/${x.attemptId}`} className={x.completion === "completed" ? "font-semibold text-ink-900 hover:text-brand-700" : "text-ink-500 hover:text-brand-700"}>
                            {Math.round(x.grade * 10) / 10}
                            {x.source !== "approved" && "*"}
                            {x.completion !== "completed" && <span className="ml-1 text-xs">(in progress)</span>}
                          </Link>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-sm text-ink-500">Students are matched across assignments by the name and period they type, so ask students to type their name the same way each time.</p>
    </div>
  );
}
