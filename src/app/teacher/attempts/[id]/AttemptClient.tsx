"use client";
import { LocalTime } from "@/components/LocalTime";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, Input, Label, Textarea, cx, useConfirm, useToast } from "@/components/ui";
import { PageHeader } from "@/components/teacher/PageHeader";
import { ResponseReview } from "@/components/teacher/ResponseReview";
import { RichText } from "@/components/RichText";
import { fmtDuration, pct } from "@/lib/format";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import type { getAttemptDetail } from "@/lib/services/results";

type D = Awaited<ReturnType<typeof getAttemptDetail>>;

const STATUS_LABEL: Record<string, string> = { locked: "Locked", available: "Not started", in_progress: "In progress", passed: "Passed", provisional: "Pending review", failed: "Below pass mark", exhausted: "Out of tries" };

export function AttemptClient({ data }: { data: D }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { attempt, assignment, summary, sections } = data;
  const [grade, setGrade] = useState(attempt.approvedGrade != null ? String(attempt.approvedGrade) : "");
  const [note, setNote] = useState(attempt.teacherNote ?? "");
  const [openRun, setOpenRun] = useState<string | null>(() => sections.flatMap((s) => s.runs.filter((r) => r.id === s.summary.gradedRunId)).map((r) => r.id)[0] ?? null);

  const saveGrade = async (value: number | null) => {
    try {
      await api(`/api/teacher/attempts/${attempt.id}`, { method: "PATCH", body: { approvedGrade: value, note } });
      toast(value == null ? "Approved grade cleared" : "Grade approved");
      if (value != null) setGrade(String(value));
      else setGrade("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ href: `/teacher/assignments/${assignment.id}/results`, label: `${assignment.title} — results` }]}
        title={attempt.studentName}
        sub={
          <span className="flex flex-wrap gap-x-3">
            <span>{data.periodName ?? "No period"}</span>
            <span>Version {data.versionNumber}</span>
            <span>Started <LocalTime value={attempt.startedAt} /></span>
            {attempt.completedAt && <span>Completed <LocalTime value={attempt.completedAt} /></span>}
            <span>Time on task {fmtDuration(attempt.activeSeconds)}</span>
            <span>Resume code <b className="font-mono">{attempt.resumeCode}</b></span>
          </span>
        }
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              if (await confirm({ title: `Reset ${attempt.studentName}'s work?`, message: "Deletes this student's entire submission so they can start over (or so a mistaken name can be removed). This can't be undone.", danger: true, confirmLabel: "Delete submission", typeToConfirm: "DELETE" })) {
                await api(`/api/teacher/attempts/${attempt.id}`, { method: "DELETE" });
                toast("Submission deleted");
                router.push(`/teacher/assignments/${assignment.id}/results`);
              }
            }}
          >
            Reset / delete
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Completion</div>
          <div className="mt-1 text-xl font-bold">{summary.completion === "completed" ? "Completed" : summary.completion === "in_progress" ? "In progress" : "Not started"}</div>
          <div className="text-sm text-ink-500">{summary.passing === "passed" ? "Passed every section" : summary.passing === "pending_review" ? "Pending your review" : "Not all sections passed"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Suggested grade</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{pct(summary.suggestedPercent, 1)}</div>
          <div className="text-sm text-ink-500">
            {Math.round(summary.suggestedPoints * 10) / 10} / {summary.totalPoints} points · {data.settings.gradeBasis} try{summary.provisional && " · includes provisional scores"}
          </div>
        </Card>
        <Card className="p-4">
          <Label htmlFor="ag">Teacher-approved grade (%)</Label>
          <div className="flex gap-2">
            <Input id="ag" type="number" min={0} max={1000} step={0.1} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder={String(summary.suggestedPercent)} />
            <Button onClick={() => saveGrade(grade === "" ? summary.suggestedPercent : Number(grade))}>Approve</Button>
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-500">
            <button className="hover:underline" onClick={() => saveGrade(summary.suggestedPercent)}>Use suggested ({pct(summary.suggestedPercent, 1)})</button>
            {attempt.approvedGrade != null && <button className="hover:underline" onClick={() => saveGrade(null)}>Clear</button>}
          </div>
        </Card>
      </div>
      <Card className="mt-4 p-4">
        <Label htmlFor="note" hint="(private — never shown to the student)">Teacher note</Label>
        <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (attempt.teacherNote ?? "") && saveGrade(attempt.approvedGrade)} />
      </Card>

      <div className="mt-6 space-y-5">
        {sections.map((s, si) => (
          <Card key={s.key} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">{si + 1}</span>
              <h2 className="text-lg font-bold">{s.title}</h2>
              <Badge tone={s.summary.status === "passed" ? "green" : s.summary.status === "provisional" ? "amber" : s.summary.status === "failed" ? "red" : "gray"}>{STATUS_LABEL[s.summary.status]}</Badge>
              <span className="ml-auto text-sm text-ink-600">
                Counts: <b>{pct(s.summary.percent, 1)}</b> → {Math.round(s.summary.points * 10) / 10}/{Math.round(s.summary.weight * 10) / 10} pts
              </span>
            </div>
            {s.runs.length === 0 && <p className="px-4 py-4 text-ink-500">Not attempted.</p>}
            {s.runs.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {s.runs.map((r) => (
                  <button key={r.id} onClick={() => setOpenRun(openRun === r.id ? null : r.id)} className={cx("rounded-xl border-2 px-3 py-1.5 text-sm font-semibold", openRun === r.id ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white")}>
                    Try {r.runNumber}: {r.status === "submitted" ? pct(r.percent) : "in progress"}
                    {!r.countsForGrade && " (practice)"}
                    {r.id === s.summary.gradedRunId && " ★"}
                  </button>
                ))}
              </div>
            )}
            {s.runs.filter((r) => r.id === openRun).map((r) => (
              <div key={r.id} className="space-y-3 p-4">
                <div className="text-sm text-ink-500">
                  {r.status === "submitted" ? (
                    <>Submitted <LocalTime value={r.submittedAt} /> · {Math.round((r.score ?? 0) * 100) / 100}/{r.maxScore} · {r.outcome}</>
                  ) : (
                    <>Started <LocalTime value={r.startedAt} /> — not submitted yet (showing saved draft)</>
                  )}
                  {r.id === s.summary.gradedRunId && " · ★ this try counts for the grade"}
                </div>
                {r.responses.map((resp, qi) => (
                  <div key={resp.key} className={cx("rounded-2xl border p-4", resp.responseId == null ? "border-ink-200" : (resp.teacherScore ?? resp.autoScore ?? 0) >= resp.maxScore ? "border-emerald-200" : (resp.teacherScore ?? resp.autoScore ?? 0) > 0 ? "border-amber-200" : "border-rose-200")}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{qi + 1}. {QUESTION_TYPE_LABELS[resp.type]}</div>
                    <RichText text={resp.prompt} className="mt-1 font-medium text-ink-900" />
                    <div className="mt-2 grid gap-2 text-[15px] md:grid-cols-2">
                      <div><span className="text-ink-500">Student: </span><span className="whitespace-pre-line font-medium">{resp.yourAnswer || "—"}</span></div>
                      <div><span className="text-ink-500">{resp.type === "short_answer" ? "Example answer: " : "Correct: "}</span><span className="text-emerald-800">{resp.correctAnswer}</span></div>
                    </div>
                    {resp.responseId && (
                      <div className="mt-3">
                        <ResponseReview
                          compact={resp.type !== "short_answer"}
                          item={{ responseId: resp.responseId, autoScore: resp.autoScore ?? 0, teacherScore: resp.teacherScore, maxScore: resp.maxScore, method: resp.method, detail: resp.detail, needsReview: resp.needsReview, reviewedAt: resp.reviewedAt as string | null, teacherFeedback: resp.teacherFeedback }}
                          onDone={() => router.refresh()}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
