"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Input, Textarea, cx, useToast } from "@/components/ui";
import type { GradeDetail } from "@/lib/types";

export interface ReviewItem {
  responseId: string;
  autoScore: number;
  teacherScore: number | null;
  maxScore: number;
  method: string | null;
  detail: GradeDetail | null;
  needsReview: boolean;
  reviewedAt: string | null;
  teacherFeedback: string | null;
}

/** Score override control for one answer (any question type). */
export function ResponseReview({ item, onDone, compact }: { item: ReviewItem; onDone?: () => void; compact?: boolean }) {
  const toast = useToast();
  const current = item.teacherScore ?? item.autoScore;
  const [score, setScore] = useState(String(Math.round(current * 100) / 100));
  const [fb, setFb] = useState(item.teacherFeedback ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (value: number) => {
    setBusy(true);
    try {
      await api(`/api/teacher/responses/${item.responseId}`, { method: "PATCH", body: { score: value, feedback: fb || null } });
      setScore(String(value));
      toast("Score saved");
      onDone?.();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    try {
      await api(`/api/teacher/responses/approve`, { body: { ids: [item.responseId] } });
      toast("Approved");
      onDone?.();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const methodLabel = item.method === "ai" ? "AI suggestion" : item.method === "rubric" ? "Rubric suggestion (provisional)" : "Automatic";
  return (
    <div className={cx("rounded-xl border border-ink-200 bg-ink-50/60 p-3", compact && "p-2")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">{methodLabel}:</span>
        <b className="tabular-nums">{Math.round(item.autoScore * 100) / 100}/{item.maxScore}</b>
        {item.teacherScore != null && <Badge tone="green">Your score: {item.teacherScore}/{item.maxScore}</Badge>}
        {item.reviewedAt ? <Badge tone="green">Reviewed</Badge> : item.needsReview ? <Badge tone="amber">Needs review</Badge> : null}
        {item.detail?.confidence === "low" && <Badge tone="amber">Low confidence</Badge>}
      </div>
      {item.detail?.flags && item.detail.flags.length > 0 && (
        <ul className="mt-1 text-sm text-amber-800">{item.detail.flags.map((f, i) => <li key={i}>⚑ {f}</li>)}</ul>
      )}
      {item.detail?.criteria && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {item.detail.criteria.map((c) => (
            <li key={c.id} className={c.met ? "text-emerald-700" : "text-ink-500"}>
              {c.met ? "✓" : "○"} {c.concept} <span className="text-ink-400">({c.points} pt{c.points === 1 ? "" : "s"})</span>
              {c.evidence && <span className="text-ink-400"> — “{c.evidence}”</span>}
            </li>
          ))}
        </ul>
      )}
      {item.detail?.aiRationale && <p className="mt-1 text-sm italic text-ink-600">AI note: {item.detail.aiRationale}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => save(0)} disabled={busy}>0</Button>
        {item.maxScore > 0 && <Button size="sm" variant="secondary" onClick={() => save(Math.round((item.maxScore / 2) * 100) / 100)} disabled={busy}>Half</Button>}
        <Button size="sm" variant="secondary" onClick={() => save(item.maxScore)} disabled={busy}>Full ({item.maxScore})</Button>
        <div className="flex items-center gap-1">
          <Input type="number" min={0} max={item.maxScore} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} className="h-8 w-20 text-sm" aria-label="Score" />
          <Button size="sm" onClick={() => save(Math.max(0, Math.min(item.maxScore, Number(score) || 0)))} loading={busy}>Save</Button>
        </div>
        {!item.reviewedAt && item.method !== "auto" && (
          <Button size="sm" variant="success" onClick={approve} disabled={busy}>Accept suggestion</Button>
        )}
      </div>
      {!compact && (
        <Textarea rows={2} className="mt-2 text-sm" placeholder="Optional feedback the student will see…" value={fb} onChange={(e) => setFb(e.target.value)} />
      )}
    </div>
  );
}
