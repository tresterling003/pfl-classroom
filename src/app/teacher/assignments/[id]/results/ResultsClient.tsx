"use client";
import { LocalTime, browserTimeZone } from "@/components/LocalTime";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, EmptyState, Input, Select, Stat, Toggle, cx, useConfirm, useToast } from "@/components/ui";
import { PageHeader, StatusBadge } from "@/components/teacher/PageHeader";
import { fmtDuration, pct } from "@/lib/format";
import type { getAssignmentResults } from "@/lib/services/results";

type Data = Awaited<ReturnType<typeof getAssignmentResults>>;
type Row = Data["rows"][number];

const COMPLETION: Record<string, { label: string; tone: "green" | "sky" | "gray" }> = {
  completed: { label: "Completed", tone: "green" },
  in_progress: { label: "In progress", tone: "sky" },
  not_started: { label: "Not started", tone: "gray" },
};

function cellTone(p: number | null, status: string) {
  if (p == null) return status === "locked" ? "text-ink-300" : "text-ink-400";
  if (p >= 90) return "bg-emerald-50 text-emerald-800";
  if (p >= 70) return "bg-emerald-50/50 text-emerald-700";
  if (p >= 50) return "bg-amber-50 text-amber-800";
  return "bg-rose-50 text-rose-800";
}

export function ResultsClient({ data, courseName, periodId }: { data: Data; courseName: string; periodId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const a = data.assignment;
  const [tab, setTab] = useState<"students" | "questions">("students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"name" | "grade" | "period" | "status">("period");
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [live, router]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const r = data.rows.filter(
      (x) => (!s || x.studentName.toLowerCase().includes(s)) && (!status || (status === "review" ? x.pendingReview > 0 : status === "working" ? x.workingNow : x.completion === status)),
    );
    const by: Record<typeof sort, (x: Row, y: Row) => number> = {
      name: (x, y) => x.studentName.localeCompare(y.studentName),
      grade: (x, y) => y.gradebookGrade - x.gradebookGrade,
      period: (x, y) => x.periodName.localeCompare(y.periodName) || x.studentName.localeCompare(y.studentName),
      status: (x, y) => x.completion.localeCompare(y.completion),
    };
    return [...r].sort(by[sort]);
  }, [data.rows, search, status, sort]);

  const sectionTitles = data.rows[0]?.sections.map((s) => s.title) ?? data.stats.sectionAverages.map((s) => s.title);
  const exportHref = `/api/teacher/assignments/${a.id}/export${periodId ? `?period=${periodId}` : ""}`;

  const approveAll = async () => {
    const ok = await confirm({ title: "Approve suggested grades?", message: "Approves the suggested grade for every COMPLETED student with no answers waiting for review. Students with pending reviews are skipped. You can still change any grade later.", confirmLabel: "Approve" });
    if (!ok) return;
    try {
      const r = await api<{ count: number }>(`/api/teacher/assignments/${a.id}/approve-all`, { body: periodId ? { periodId } : {} });
      toast(`Approved ${r.count} grade${r.count === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        crumbs={[{ href: `/teacher/classes/${a.courseId}`, label: courseName }, { href: `/teacher/assignments/${a.id}`, label: a.title }]}
        title="Results"
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} archived={!!a.archivedAt} /> {a.title}
            {a.status === "published" && <> · code <b className="font-mono tracking-wider">{a.joinCode}</b></>}
          </span>
        }
        actions={
          <>
            <Select value={periodId} onChange={(e) => router.push(`?period=${e.target.value}`)} aria-label="Period" className="w-44">
              <option value="">All periods</option>
              {data.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <a href={exportHref} onClick={(e) => { e.preventDefault(); window.location.assign(`${exportHref}${exportHref.includes("?") ? "&" : "?"}tz=${encodeURIComponent(browserTimeZone())}`); }}>
              <Button>⬇ Export grades (CSV)</Button>
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Students" value={data.stats.students} sub={periodId ? data.periods.find((p) => p.id === periodId)?.name : "all periods"} />
        <Stat label="Completed" value={data.stats.completed} tone="green" />
        <Stat label="In progress" value={data.stats.inProgress} sub={`${data.stats.workingNow} working now · ${data.stats.students - data.stats.completed - data.stats.inProgress} not started`} tone="brand" />
        <Stat label="Class average" value={pct(data.stats.averageCompleted, 1)} sub="completed students" />
        <Stat label="Needs review" value={data.stats.needsReview} tone={data.stats.needsReview ? "amber" : undefined} sub={data.stats.needsReview ? <Link href={`/teacher/review?assignment=${a.id}`} className="font-semibold text-amber-700 hover:underline">Review now →</Link> : "short answers"} />
      </div>
      {data.stats.sectionAverages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {data.stats.sectionAverages.map((s, i) => (
            <span key={i} className="rounded-xl border border-ink-200 bg-white px-3 py-1.5">
              <span className="text-ink-500">S{i + 1} {s.title}: </span>
              <b className="tabular-nums">{pct(s.average, 1)}</b>
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200">
        <div className="flex gap-1">
          {(["students", "questions"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 px-4 py-2.5 text-[15px] font-semibold", tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500")}>
              {t === "students" ? `Students (${data.rows.length})` : "Question analysis"}
            </button>
          ))}
        </div>
        <div className="pb-2"><Toggle checked={live} onChange={setLive} label="Live update" /></div>
      </div>

      {tab === "students" && (
        <>
          <div className="my-4 flex flex-wrap gap-2">
            <Input placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" aria-label="Search students" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48" aria-label="Status filter">
              <option value="">Everyone</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="working">Working right now</option>
              <option value="review">Needs review</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-44" aria-label="Sort">
              <option value="period">Sort: period</option>
              <option value="name">Sort: name</option>
              <option value="grade">Sort: grade</option>
              <option value="status">Sort: status</option>
            </Select>
            <div className="flex-1" />
            <Button variant="secondary" onClick={approveAll}>Approve ready grades</Button>
          </div>
          {rows.length === 0 ? (
            <EmptyState title={data.rows.length ? "No students match" : "No submissions yet"}>
              {!data.rows.length && (a.status === "published" ? <>Students join with code <b className="font-mono">{a.joinCode}</b>. This page updates live.</> : "Publish the assignment to let students join.")}
            </EmptyState>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Period</th>
                    <th className="px-3 py-3">Status</th>
                    {sectionTitles.map((t, i) => <th key={i} className="px-2 py-3 text-center" title={t}>S{i + 1}</th>)}
                    <th className="px-3 py-3 text-right">Suggested</th>
                    <th className="px-3 py-3 text-right">Approved</th>
                    <th className="px-3 py-3 text-right">Time</th>
                    <th className="px-3 py-3">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.attemptId} className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-brand-50/40" onClick={() => router.push(`/teacher/attempts/${r.attemptId}`)}>
                      <td className="px-3 py-2.5">
                        <Link href={`/teacher/attempts/${r.attemptId}`} className="font-semibold text-ink-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{r.studentName}</Link>
                        {r.workingNow && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" title="Working now" />}
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">{r.periodName}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={COMPLETION[r.completion].tone}>{COMPLETION[r.completion].label}</Badge>
                        {r.pendingReview > 0 && <Badge tone="amber" className="ml-1">{r.pendingReview} to review</Badge>}
                      </td>
                      {r.sections.map((s, i) => (
                        <td key={i} className="px-1 py-1.5 text-center">
                          <span className={cx("inline-block min-w-12 rounded-lg px-1.5 py-1 font-semibold tabular-nums", cellTone(s.percent, s.status))} title={`${s.title}: ${s.status}, ${s.runs} tries`}>
                            {s.percent == null ? (s.status === "locked" ? "🔒" : "—") : Math.round(s.percent)}
                            {s.runs > 1 && <sup className="ml-0.5 text-[10px] font-normal text-ink-500">×{s.runs}</sup>}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                        {pct(r.suggestedPercent, 1)}
                        {r.provisional && <span className="ml-0.5 text-amber-600" title="Includes provisional short-answer scores">*</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.approvedGrade != null ? <b className="text-emerald-700">{pct(r.approvedGrade, 1)}</b> : <span className="text-ink-400">—</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{fmtDuration(r.activeSeconds)}</td>
                      <td className="px-3 py-2.5 text-ink-500"><LocalTime value={r.lastActiveAt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="mt-3 text-sm text-ink-500">
            <b>Suggested</b> = automatic grade using the {a.settings.gradeBasis} try of each section ({a.settings.totalPoints} points, sections weighted {a.settings.sectionWeighting === "equal" ? "equally" : "by points"}). * = includes short-answer scores you haven&apos;t reviewed. <b>Approved</b> = the grade you confirmed; the CSV&apos;s “Gradebook Grade” uses it when set. Passing a section ({a.settings.passPercent}%) only unlocks the next one — it isn&apos;t the grade.
          </p>
        </>
      )}

      {tab === "questions" && <QuestionAnalysis data={data} />}
    </div>
  );
}

function QuestionAnalysis({ data }: { data: Data }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  if (!data.questionStats.length) return <EmptyState title="No answers yet">Question accuracy appears once students submit sections.</EmptyState>;
  const accept = async (qid: string, answer: string, count: number) => {
    const ok = await confirm({ title: `Accept “${answer}”?`, message: `Gives full credit to every student who typed “${answer}” for this question (${count} so far), and recalculates their scores. To accept it for future students too, add it as an accepted answer in the question editor and publish changes.`, confirmLabel: "Accept for everyone" });
    if (!ok) return;
    try {
      const r = await api<{ count: number }>(`/api/teacher/assignments/${data.assignment.id}/accept-answer`, { body: { sourceQuestionId: qid, answer } });
      toast(`Updated ${r.count} answer${r.count === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-ink-500">Sorted from most-missed to least-missed, across all tries.</p>
      {data.questionStats.map((q) => (
        <Card key={q.key} className="p-4">
          <div className="flex items-start gap-4">
            <div className={cx("flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl font-bold tabular-nums", q.accuracy >= 80 ? "bg-emerald-50 text-emerald-700" : q.accuracy >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>
              <span className="text-lg">{Math.round(q.accuracy)}%</span>
              <span className="text-[10px] font-medium uppercase">correct</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{q.section} · {q.attempts} answers · {q.wrong} missed</div>
              <div className="mt-0.5 line-clamp-3 whitespace-pre-line font-medium text-ink-900">{q.prompt}</div>
              {q.wrongAnswers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-sm text-ink-500">Common wrong answers:</span>
                  {q.wrongAnswers.map((w) => (
                    <span key={w.answer} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-50 px-2 py-0.5 text-sm">
                      “{w.answer}” <b className="text-ink-500">×{w.count}</b>
                      <button className="ml-1 font-semibold text-brand-700 hover:underline" onClick={() => accept(q.key, w.answer, w.count)}>accept</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
