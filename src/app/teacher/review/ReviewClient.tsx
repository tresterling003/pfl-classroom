"use client";
import { LocalTime } from "@/components/LocalTime";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, EmptyState, useConfirm, useToast } from "@/components/ui";
import { PageHeader } from "@/components/teacher/PageHeader";
import { ResponseReview } from "@/components/teacher/ResponseReview";
import { RichText } from "@/components/RichText";
import type { reviewQueue } from "@/lib/services/results";

type Item = Awaited<ReturnType<typeof reviewQueue>>[number];

export function ReviewClient({ items, filtered }: { items: Item[]; filtered: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [done, setDone] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !done.has(i.responseId));
  const groups = new Map<string, Item[]>();
  for (const i of visible) {
    const k = `${i.assignmentTitle}|||${i.prompt}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }
  const acceptAll = async () => {
    if (!(await confirm({ title: `Accept all ${visible.length} suggested scores?`, message: "Marks every listed answer as reviewed using its suggested score. You can still change any score later from the student's page.", confirmLabel: "Accept all" }))) return;
    try {
      await api("/api/teacher/responses/approve", { body: { ids: visible.map((v) => v.responseId) } });
      toast("All accepted");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Needs review"
        sub="Short answers the automatic grader wasn't sure about. Scores here are suggestions until you confirm them."
        actions={
          <>
            {filtered && <Link href="/teacher/review"><Button variant="secondary">Show all classes</Button></Link>}
            {visible.length > 0 && <Button variant="success" onClick={acceptAll}>Accept all suggestions</Button>}
          </>
        }
      />
      {visible.length === 0 ? (
        <EmptyState title="All caught up!">Nothing is waiting for your review.</EmptyState>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([k, list]) => (
            <section key={k}>
              <div className="mb-2 text-sm font-semibold text-ink-500">{list[0].courseName} · {list[0].assignmentTitle}</div>
              <Card className="mb-3 p-4">
                <RichText text={list[0].prompt} className="text-lg font-semibold text-ink-900" />
                {list[0].rubric.length > 0 && (
                  <div className="mt-2 text-sm text-ink-600">
                    <b>Rubric:</b> {list[0].rubric.map((r) => `${r.concept} (${r.points})`).join(" · ")}
                  </div>
                )}
                {list[0].sampleAnswer && <div className="mt-1 text-sm text-ink-500"><b>Example:</b> {list[0].sampleAnswer}</div>}
              </Card>
              <div className="space-y-3">
                {list.map((i) => (
                  <Card key={i.responseId} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/teacher/attempts/${i.attemptId}`} className="font-bold text-ink-900 hover:text-brand-700">{i.studentName}</Link>
                      <span className="text-sm text-ink-500"><LocalTime value={i.submittedAt} /></span>
                    </div>
                    <p className="mt-2 whitespace-pre-line rounded-xl bg-white text-[16px] leading-relaxed text-ink-800">{i.text || <em className="text-ink-400">(blank)</em>}</p>
                    <div className="mt-3">
                      <ResponseReview
                        item={{ responseId: i.responseId, autoScore: i.autoScore, teacherScore: null, maxScore: i.maxScore, method: i.method, detail: i.detail, needsReview: true, reviewedAt: null, teacherFeedback: null }}
                        onDone={() => { setDone((d) => new Set(d).add(i.responseId)); router.refresh(); }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
