"use client";

import { useEffect, useState } from "react";
import { RichText } from "@/components/RichText";
import { Button, cx } from "@/components/ui";
import { play } from "./sound";

export interface QFeedback {
  key: string;
  type: "matching" | "fill_blank" | "multiple_choice" | "short_answer";
  prompt: string;
  yourAnswer: string;
  correct: boolean | null;
  earned: number | null;
  max: number;
  explanation: string | null;
  correctAnswer: string | null;
  note?: string;
  concepts?: { concept: string; met: boolean }[];
  aiFeedback?: string;
  provisional: boolean;
  reviewed: boolean;
}

export interface RunResult {
  runId: string;
  sectionKey: string;
  sectionTitle: string;
  runNumber: number;
  practice: boolean;
  outcome: "passed" | "failed" | "provisional" | null;
  percent: number | null;
  score: number | null;
  maxScore: number | null;
  correctCount: number | null;
  total: number;
  passPercent: number;
  answersRevealed: boolean;
  questions: QFeedback[];
}

function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(percent * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [percent]);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="var(--color-ink-100)" strokeWidth="11" fill="none" />
        <circle cx="60" cy="60" r={r} stroke={passed ? "#10b981" : "#f59e0b"} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums text-ink-900">{shown}%</span>
      </div>
    </div>
  );
}

export function FeedbackCard({ fb, index, compact }: { fb: QFeedback; index?: number; compact?: boolean }) {
  const state = fb.correct === true ? "right" : fb.correct === false ? "wrong" : fb.correct === null && fb.earned != null ? "partial" : "hidden";
  const tone = {
    right: "border-emerald-200 bg-emerald-50/40",
    wrong: "border-rose-200 bg-rose-50/40",
    partial: "border-amber-200 bg-amber-50/40",
    hidden: "border-ink-200 bg-white",
  }[state];
  const icon = { right: "✓", wrong: "✗", partial: "◐", hidden: "•" }[state];
  const iconCls = { right: "bg-emerald-500", wrong: "bg-rose-500", partial: "bg-amber-500", hidden: "bg-ink-300" }[state];
  return (
    <div className={cx("rounded-2xl border-2 p-4 sm:p-5", tone, state === "wrong" && !compact && "animate-rise")}>
      <div className="flex gap-3">
        <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", iconCls)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="text-[15px] font-semibold text-ink-900">
              {index != null && <span className="text-ink-400">{index + 1}. </span>}
              <RichText text={fb.prompt} className="inline [&>p]:inline" />
            </div>
          )}
          <div className={cx("text-[15px]", !compact && "mt-2")}>
            <span className="text-ink-500">Your answer: </span>
            <span className={cx("font-medium", state === "wrong" ? "text-rose-800" : "text-ink-800")}>{fb.yourAnswer || "—"}</span>
            {fb.earned != null && (
              <span className="ml-2 text-sm tabular-nums text-ink-500">
                ({Math.round(fb.earned * 100) / 100}/{fb.max})
              </span>
            )}
          </div>
          {fb.note && fb.correct && <div className="mt-1 text-sm text-emerald-700">{fb.note}</div>}
          {fb.correctAnswer && fb.correct !== true && fb.type !== "short_answer" && (
            <div className="mt-1 text-[15px]">
              <span className="text-ink-500">Correct answer: </span>
              <span className="font-semibold text-emerald-800">{fb.correctAnswer}</span>
            </div>
          )}
          {fb.concepts && fb.concepts.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {fb.concepts.map((c, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <span className={c.met ? "text-emerald-600" : "text-rose-500"}>{c.met ? "✓" : "○"}</span>
                  <span className={c.met ? "text-ink-700" : "text-ink-900"}>
                    {c.met ? "" : <span className="font-semibold">Missing: </span>}
                    {c.concept}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {fb.aiFeedback && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[15px] text-ink-700">{fb.aiFeedback}</p>}
          {fb.explanation && (
            <div className={cx("mt-3 rounded-xl px-3.5 py-2.5 text-[15px] leading-relaxed", state === "right" ? "bg-white/60 text-ink-600" : "bg-white text-ink-800 shadow-sm")}>
              <span className="font-semibold text-brand-700">Why: </span>
              <RichText text={fb.explanation} className="inline [&>p]:inline" />
            </div>
          )}
          {fb.correctAnswer && fb.type === "short_answer" && fb.correct !== true && (
            <div className="mt-2 text-[15px] text-ink-600">
              <span className="font-semibold">Example of a strong answer: </span>
              {fb.correctAnswer}
            </div>
          )}
          {fb.provisional && fb.type === "short_answer" && (
            <div className="mt-2 text-xs font-medium text-amber-700">Suggested score — your teacher may adjust it.</div>
          )}
          {fb.reviewed && fb.type === "short_answer" && <div className="mt-2 text-xs font-medium text-emerald-700">Reviewed by your teacher.</div>}
        </div>
      </div>
    </div>
  );
}

export function ResultView({
  result,
  isLastSection,
  canRetry,
  nextRunIsPractice,
  onRetry,
  onNext,
  onOverview,
  showScores,
}: {
  result: RunResult;
  isLastSection: boolean;
  canRetry: boolean;
  nextRunIsPractice: boolean;
  onRetry: () => void;
  onNext: () => void;
  onOverview: () => void;
  showScores: boolean;
}) {
  const passed = result.outcome === "passed";
  const provisional = result.outcome === "provisional";
  const advance = passed || provisional;
  useEffect(() => {
    if (showScores) play(advance ? "pass" : "fail");
  }, [advance, showScores]);
  const [filter, setFilter] = useState<"all" | "missed">(advance ? "all" : "missed");
  const missed = result.questions.filter((q) => q.correct !== true);
  const list = filter === "missed" ? missed : result.questions;

  return (
    <div className="mx-auto max-w-3xl pb-16 pt-6">
      <div className="animate-pop rounded-3xl border border-ink-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          {result.sectionTitle} · Try {result.runNumber}
          {result.practice && " (practice — doesn't change your grade)"}
        </div>
        {showScores && result.percent != null ? (
          <>
            <div className="mt-4 flex justify-center">
              <ScoreRing percent={Math.round(result.percent)} passed={advance} />
            </div>
            <div className="mt-2 text-ink-600">
              {result.correctCount} of {result.total} fully correct
            </div>
            <h2 className={cx("mt-4 text-2xl font-extrabold", passed ? "text-emerald-700" : provisional ? "text-amber-700" : "text-ink-900")}>
              {passed ? (isLastSection ? "Section passed — that was the last one!" : "Section passed! Next section unlocked.") : provisional ? "Submitted for teacher review" : `Not quite — you need ${result.passPercent}% to pass.`}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-ink-600">
              {passed
                ? "Nice work. Look over anything you missed, then keep going."
                : provisional
                  ? "Some of your written answers need your teacher's eyes. You can keep going — your teacher will finalize this score."
                  : canRetry
                    ? "Read the explanations below — they show exactly what to fix. Then try the section again."
                    : "You've used all your tries for this section. You can move on."}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-2xl font-extrabold text-ink-900">Section submitted</h2>
            <p className="mt-2 text-ink-600">Your teacher will share results later.</p>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!advance && canRetry && (
            <Button size="lg" onClick={onRetry}>
              {nextRunIsPractice ? "Practice again" : "Try again"}
            </Button>
          )}
          {(advance || !canRetry) && !isLastSection && (
            <Button size="lg" variant="success" onClick={onNext}>
              Next section →
            </Button>
          )}
          {(advance || !canRetry) && isLastSection && (
            <Button size="lg" variant="success" onClick={onOverview}>
              See my results
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={onOverview}>
            All sections
          </Button>
        </div>
      </div>

      {showScores && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink-900">Review your answers</h3>
            <div className="flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
              <button className={cx("rounded-lg px-3 py-1", filter === "missed" ? "bg-white shadow-sm" : "text-ink-500")} onClick={() => setFilter("missed")}>
                Missed ({missed.length})
              </button>
              <button className={cx("rounded-lg px-3 py-1", filter === "all" ? "bg-white shadow-sm" : "text-ink-500")} onClick={() => setFilter("all")}>
                All ({result.questions.length})
              </button>
            </div>
          </div>
          {!result.answersRevealed && missed.length > 0 && (
            <p className="mb-3 text-sm text-ink-500">Correct answers appear after you pass this section — use the explanations to figure them out.</p>
          )}
          <div className="space-y-3">
            {list.length === 0 && <p className="rounded-2xl bg-emerald-50 p-5 text-center font-semibold text-emerald-800">Perfect — nothing missed!</p>}
            {list.map((q) => (
              <FeedbackCard key={q.key} fb={q} index={result.questions.indexOf(q)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
