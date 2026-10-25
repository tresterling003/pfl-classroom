import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth";
import { dashboardData } from "@/lib/services/results";
import { Card, Stat, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/teacher/PageHeader";
import { pct } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const t = await requireTeacherPage();
  const d = await dashboardData(t.id);
  const working = d.active.reduce((a, x) => a + x.working, 0);
  const completed = d.active.reduce((a, x) => a + x.completed, 0);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Welcome back, ${t.name}`} sub="Here's what's happening in your classes." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Live assignments" value={d.active.length} />
        <Stat label="Working right now" value={working} tone="brand" sub="active in the last 2 min" />
        <Stat label="Completed" value={completed} tone="green" sub="across live assignments" />
        <Link href="/teacher/review">
          <Stat label="Needs grading" value={d.reviewCount} tone={d.reviewCount ? "amber" : undefined} sub="short answers to review →" />
        </Link>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink-900">Live assignments</h2>
      {d.active.length === 0 ? (
        <EmptyState title="Nothing is live yet">
          Open a class, choose an assignment and press <b>Publish</b> to give students a join code.
          {d.drafts.length > 0 && (
            <div className="mt-3">
              Ready to publish:{" "}
              {d.drafts.map((x) => (
                <Link key={x.id} href={`/teacher/assignments/${x.id}`} className="mr-2 font-semibold text-brand-700 hover:underline">
                  {x.title}
                </Link>
              ))}
            </div>
          )}
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Closes</th>
                <th className="px-4 py-3 text-right">Completed</th>
                <th className="px-4 py-3 text-right">Working</th>
                <th className="px-4 py-3 text-right">Avg</th>
                <th className="px-4 py-3 text-right">To grade</th>
              </tr>
            </thead>
            <tbody>
              {d.active.map((a) => (
                <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/teacher/assignments/${a.id}/results`} className="font-semibold text-ink-900 hover:text-brand-700">
                      {a.title}
                    </Link>
                    <div className="text-sm text-ink-500">{a.courseName}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold tracking-wider">{a.joinCode}</td>
                  <td className="px-4 py-3 text-ink-600">{a.closesAt ? <LocalTime value={a.closesAt} /> : "No deadline"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {a.completed}/{a.started}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.working > 0 ? <span className="font-semibold text-brand-700">{a.working}</span> : 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(a.average)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.needsReview > 0 ? <span className="font-semibold text-amber-700">{a.needsReview}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Upcoming deadlines</h2>
          <Card className="divide-y divide-ink-100">
            {d.upcoming.length === 0 && <p className="p-4 text-ink-500">No upcoming deadlines.</p>}
            {d.upcoming.map((u) => (
              <Link key={u.id} href={`/teacher/assignments/${u.id}/results`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-50">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-900">{u.title}</div>
                  <div className="text-sm text-ink-500">{u.courseName}</div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="font-semibold text-ink-800"><LocalTime value={u.closesAt} mode="relative" /></div>
                  <div className="text-ink-500"><LocalTime value={u.closesAt} /></div>
                </div>
              </Link>
            ))}
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink-900">Latest finished</h2>
          <Card className="divide-y divide-ink-100">
            {d.recent.length === 0 && <p className="p-4 text-ink-500">No completed submissions yet.</p>}
            {d.recent.map((r) => (
              <Link key={r.attemptId} href={`/teacher/attempts/${r.attemptId}`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-50">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-900">{r.studentName}</div>
                  <div className="truncate text-sm text-ink-500">{r.title}</div>
                </div>
                <div className="shrink-0 text-sm text-ink-500"><LocalTime value={r.completedAt} mode="relative" /></div>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
