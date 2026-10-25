"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, ProgressBar, cx } from "@/components/ui";
import { FillBlank, MatchingBoard, MultipleChoice, PromptText, ShortAnswer, isAnswered, type Answer, type PGroup, type PQuestion } from "./questions";
import { FeedbackCard, type QFeedback } from "./ResultView";
import { play } from "./sound";

export interface ActiveRun {
  id: string;
  sectionKey: string;
  runNumber: number;
  practice: boolean;
  questions: PQuestion[];
  groups: PGroup[];
  answers: Record<string, Answer>;
  revision: number;
  checked: Record<string, QFeedback>;
}

type SaveState = "saved" | "saving" | "pending" | "offline" | "error";

/** A "step" is one question, or a whole matching board. */
type Step = { kind: "q"; q: PQuestion } | { kind: "match"; group: PGroup; questions: PQuestion[] };

const localKey = (base: string, runId: string) => `pfl:draft:${base}:${runId}`;

function readLocal(base: string, runId: string): { answers: Record<string, Answer>; rev: number } | null {
  try {
    const raw = localStorage.getItem(localKey(base, runId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(base: string, runId: string, answers: Record<string, Answer>, rev: number) {
  try {
    localStorage.setItem(localKey(base, runId), JSON.stringify({ answers, rev }));
  } catch {}
}
export function clearLocal(base: string, runId: string) {
  try {
    localStorage.removeItem(localKey(base, runId));
  } catch {}
}

export function RunView({
  apiBase,
  run,
  sectionTitle,
  sectionIndex,
  sectionCount,
  instructions,
  passPercent,
  perQuestion,
  onSubmitted,
  onExit,
}: {
  apiBase: string;
  run: ActiveRun;
  sectionTitle: string;
  sectionIndex: number;
  sectionCount: number;
  instructions: string;
  passPercent: number;
  perQuestion: boolean;
  onSubmitted: (result: unknown) => void;
  onExit: () => void;
}) {
  // Restore: prefer whichever copy (this device vs. server) was saved most recently.
  const initial = useMemo(() => {
    const local = typeof window !== "undefined" ? readLocal(apiBase, run.id) : null;
    if (local && local.rev > run.revision) return { answers: { ...run.answers, ...local.answers }, dirty: true };
    return { answers: run.answers ?? {}, dirty: false };
  }, [apiBase, run.id, run.answers, run.revision]);

  const [answers, setAnswers] = useState<Record<string, Answer>>(initial.answers);
  const [checked, setChecked] = useState<Record<string, QFeedback>>(run.checked ?? {});
  const [save, setSave] = useState<SaveState>(initial.dirty ? "pending" : "saved");
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const answersRef = useRef(answers);
  const revRef = useRef(run.revision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const dirty = useRef(initial.dirty);
  const retryDelay = useRef(2000);
  const flushRef = useRef<(opts?: { keepalive?: boolean }) => Promise<void>>(async () => {});

  const steps: Step[] = useMemo(() => {
    const out: Step[] = [];
    const seen = new Set<string>();
    for (const q of run.questions) {
      if (q.type === "matching" && q.groupId != null) {
        if (seen.has(q.groupId)) continue;
        seen.add(q.groupId);
        const group = run.groups.find((g) => g.id === q.groupId)!;
        out.push({ kind: "match", group, questions: run.questions.filter((x) => x.groupId === q.groupId) });
      } else out.push({ kind: "q", q });
    }
    return out;
  }, [run.questions, run.groups]);

  const flush = useCallback(
    async (opts: { keepalive?: boolean } = {}) => {
      if (!dirty.current || inflight.current) return;
      inflight.current = true;
      dirty.current = false;
      const rev = Date.now() > revRef.current ? Date.now() : revRef.current + 1;
      revRef.current = rev;
      setSave("saving");
      try {
        const res = await api<{ saved: boolean; submitted?: boolean }>(apiBase, {
          body: { action: "save", runId: run.id, answers: answersRef.current, revision: rev },
          keepalive: opts.keepalive,
        });
        retryDelay.current = 2000;
        setSave(dirty.current ? "pending" : "saved");
        if (res.submitted) setError("This section was already submitted (maybe in another tab). Refresh the page.");
      } catch (e) {
        dirty.current = true;
        const offline = e instanceof ApiError && e.code === "OFFLINE";
        setSave(offline ? "offline" : "error");
        // retry with backoff; answers stay safe on this device meanwhile
        const d = retryDelay.current;
        retryDelay.current = Math.min(30000, d * 2);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          void flushRef.current();
        }, d);
      } finally {
        inflight.current = false;
        if (dirty.current && timer.current == null) {
          timer.current = setTimeout(() => {
            timer.current = null;
            void flushRef.current();
          }, 800);
        }
      }
    },
    [apiBase, run.id],
  );
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSave((s) => (s === "offline" || s === "error" ? s : "pending"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, 1200);
  }, [flush]);

  const setAnswer = (key: string, a: Answer) => {
    if (checked[key]) return;
    const next = { ...answersRef.current, [key]: a };
    answersRef.current = next;
    setAnswers(next);
    setShowMissing(false);
    writeLocal(apiBase, run.id, next, Date.now());
    schedule();
  };

  useEffect(() => {
    // answers restored from this device are newer than the server copy → push them
    if (dirty.current) timer.current = setTimeout(() => void flushRef.current(), 400);
    const online = () => void flush();
    const hide = () => {
      if (document.visibilityState === "hidden") void flush({ keepalive: true });
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hide);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        void flush({ keepalive: true });
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const total = run.questions.length;
  const answeredCount = run.questions.filter((q) => isAnswered(q, answers[q.key])).length;
  const stepDone = (s: Step) => (s.kind === "q" ? isAnswered(s.q, answers[s.q.key]) : s.questions.every((q) => isAnswered(q, answers[q.key])));
  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  const go = (i: number) => {
    setStepIdx(Math.max(0, Math.min(steps.length - 1, i)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const check = async (q: PQuestion) => {
    setChecking(q.key);
    setError(null);
    try {
      const fb = await api<QFeedback>(apiBase, { body: { action: "check", runId: run.id, questionKey: q.key, answer: answers[q.key] } });
      setChecked((c) => ({ ...c, [q.key]: fb }));
      play(fb.correct ? "correct" : "wrong");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(null);
    }
  };

  const submit = async () => {
    if (answeredCount < total) {
      setShowMissing(true);
      const first = steps.findIndex((s) => !stepDone(s));
      if (first >= 0) go(first);
      return;
    }
    setSubmitting(true);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    try {
      const result = await api(apiBase, { body: { action: "submit", runId: run.id, answers: answersRef.current } });
      dirty.current = false;
      clearLocal(apiBase, run.id);
      onSubmitted(result);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const saveLabel: Record<SaveState, { text: string; cls: string }> = {
    saved: { text: "All work saved", cls: "text-emerald-700" },
    saving: { text: "Saving…", cls: "text-ink-500" },
    pending: { text: "Saving…", cls: "text-ink-500" },
    offline: { text: "Offline — saved on this device. Will sync when you reconnect.", cls: "text-amber-700" },
    error: { text: "Couldn't save to the server — retrying. Your answers are kept on this device.", cls: "text-rose-700" },
  };

  return (
    <div className="pb-28">
      {/* sticky progress header */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-ink-200/70 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <button onClick={onExit} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Back to sections">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="truncate text-sm font-bold text-ink-900">
                Section {sectionIndex + 1} of {sectionCount}: {sectionTitle}
                {run.practice && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">Practice</span>}
              </div>
              <div className="shrink-0 text-sm tabular-nums text-ink-600">
                {answeredCount}/{total} answered
              </div>
            </div>
            <ProgressBar value={(answeredCount / Math.max(1, total)) * 100} className="mt-1.5" />
          </div>
        </div>
        <div className={cx("mx-auto mt-1 max-w-3xl text-right text-xs font-medium", saveLabel[save].cls)} role="status" aria-live="polite">
          {save === "saved" && "✓ "}
          {saveLabel[save].text}
        </div>
      </div>

      <div className="mx-auto max-w-3xl pt-6">
        {stepIdx === 0 && instructions && <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-[15px] text-brand-900">{instructions}</p>}

        {/* step dots */}
        <nav aria-label="Questions" className={cx("mb-5 flex flex-wrap gap-1.5", steps.length < 2 && "hidden")}>
          {steps.map((s, i) => {
            const done = stepDone(s);
            const missing = showMissing && !done;
            const label = s.kind === "match" ? "Matching" : `Question ${run.questions.indexOf(s.q) + 1}`;
            return (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`${label}${done ? " (answered)" : ""}`}
                aria-current={i === stepIdx ? "step" : undefined}
                className={cx(
                  "h-9 min-w-9 rounded-xl px-2 text-sm font-bold tabular-nums transition",
                  i === stepIdx ? "bg-brand-600 text-white ring-4 ring-brand-500/20" : done ? "bg-emerald-100 text-emerald-800" : missing ? "bg-rose-100 text-rose-700 ring-2 ring-rose-300" : "bg-white text-ink-500 border border-ink-200 hover:border-brand-300",
                )}
              >
                {s.kind === "match" ? "⇄" : run.questions.indexOf(s.q) + 1}
              </button>
            );
          })}
        </nav>

        <div key={stepIdx} className="animate-rise">
          {step.kind === "match" ? (
            <section className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="text-sm font-semibold text-brand-700">Matching · {step.questions.length} items</div>
              <h2 className="mt-1 text-xl font-semibold text-ink-900">Match each term with the best definition.</h2>
              <MatchingBoard
                group={step.group}
                questions={step.questions}
                answers={answers}
                onChange={setAnswer}
                lockedKeys={new Set(Object.keys(checked))}
              />
              {showMissing && !stepDone(step) && <p className="mt-4 font-medium text-rose-700">Match every term before submitting.</p>}
            </section>
          ) : (
            <section className={cx("rounded-3xl border bg-white p-5 shadow-sm sm:p-7", showMissing && !stepDone(step) ? "border-rose-300" : "border-ink-200")}>
              <div className="flex items-center justify-between text-sm font-semibold text-brand-700">
                <span>
                  Question {run.questions.indexOf(step.q) + 1} of {total}
                </span>
                <span className="text-ink-400">
                  {step.q.points} {step.q.points === 1 ? "point" : "points"}
                </span>
              </div>
              <div className="mt-2">
                <PromptText q={step.q} />
              </div>
              {step.q.type === "multiple_choice" && <MultipleChoice q={step.q} value={answers[step.q.key]} onChange={(a) => setAnswer(step.q.key, a)} locked={!!checked[step.q.key]} />}
              {step.q.type === "fill_blank" && (
                <FillBlank q={step.q} value={answers[step.q.key]} onChange={(a) => setAnswer(step.q.key, a)} locked={!!checked[step.q.key]} onEnter={() => (isLast ? undefined : go(stepIdx + 1))} autoFocus />
              )}
              {step.q.type === "short_answer" && <ShortAnswer q={step.q} value={answers[step.q.key]} onChange={(a) => setAnswer(step.q.key, a)} locked={!!checked[step.q.key]} autoFocus />}
              {showMissing && !stepDone(step) && <p className="mt-3 font-medium text-rose-700">Answer this question before submitting.</p>}
              {perQuestion && !checked[step.q.key] && (
                <div className="mt-4">
                  <Button variant="secondary" onClick={() => check(step.q)} loading={checking === step.q.key} disabled={!isAnswered(step.q, answers[step.q.key])}>
                    Check answer
                  </Button>
                </div>
              )}
              {checked[step.q.key] && (
                <div className="mt-5">
                  <FeedbackCard fb={checked[step.q.key]} compact />
                </div>
              )}
            </section>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-800" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* bottom navigation */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200/70 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button variant="secondary" size="lg" onClick={() => go(stepIdx - 1)} disabled={stepIdx === 0}>
            ← Back
          </Button>
          <div className="hidden text-sm text-ink-500 sm:block">Need {passPercent}% to pass this section</div>
          {isLast ? (
            <Button size="lg" variant="success" onClick={submit} loading={submitting} className={answeredCount === total ? "animate-glow" : ""}>
              Submit section
            </Button>
          ) : (
            <Button size="lg" onClick={() => go(stepIdx + 1)}>
              Next →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
