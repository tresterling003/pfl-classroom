"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { RichText } from "@/components/RichText";
import { Button, ProgressBar, Spinner, cx } from "@/components/ui";
import { RunView, type ActiveRun } from "./RunView";
import { ResultView, type RunResult } from "./ResultView";
import { play, setSoundEnabled, soundEnabled } from "./sound";

type SectionStatus = "locked" | "available" | "in_progress" | "passed" | "provisional" | "failed" | "exhausted";

interface PSection {
  key: string;
  title: string;
  instructions: string;
  status: SectionStatus;
  passPercent: number;
  questionCount: number;
  percent: number | null;
  bestPercent: number | null;
  runsSubmitted: number;
  canRetry: boolean;
  nextRunIsPractice: boolean;
  maxGradedRuns: number;
  gradedRunsUsed: number;
  lastRunId: string | null;
  pendingReview: number;
  types: string[];
}

interface PState {
  assignment: {
    title: string;
    directions: string;
    kind: string;
    courseName: string;
    closesAt: string | null;
    open: boolean;
    closedReason: string;
    settings: { passPercent: number; sequential: boolean; feedbackTiming: string; showScores: boolean; maxGradedRuns: number; gradeBasis: string };
  };
  student: { name: string; period: string | null; resumeCode: string };
  sections: PSection[];
  completion: "not_started" | "in_progress" | "completed";
  passing: "passed" | "pending_review" | "not_passed";
  overallPercent: number | null;
  provisional: boolean;
  activeRun: ActiveRun | null;
}

type View = { kind: "overview" } | { kind: "run" } | { kind: "result"; result: RunResult };

const STATUS_UI: Record<SectionStatus, { label: string; cls: string; icon: string }> = {
  locked: { label: "Locked", cls: "bg-ink-100 text-ink-500", icon: "🔒" },
  available: { label: "Ready", cls: "bg-brand-100 text-brand-800", icon: "▶" },
  in_progress: { label: "In progress", cls: "bg-sky-100 text-sky-800", icon: "✎" },
  passed: { label: "Passed", cls: "bg-emerald-100 text-emerald-800", icon: "✓" },
  provisional: { label: "Teacher review", cls: "bg-amber-100 text-amber-800", icon: "⏳" },
  failed: { label: "Try again", cls: "bg-rose-100 text-rose-800", icon: "↻" },
  exhausted: { label: "Done", cls: "bg-ink-100 text-ink-700", icon: "■" },
};

export function Player({ apiBase, preview, onNotJoined, onReset }: { apiBase: string; preview?: boolean; onNotJoined?: () => void; onReset?: () => void }) {
  const [state, setState] = useState<PState | null>(null);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(() => typeof window !== "undefined" && soundEnabled());
  const [showCode, setShowCode] = useState(false);
  const lastInteraction = useRef(0);
  const celebrated = useRef(false);
  const isComplete = state?.completion === "completed" && view.kind === "overview";
  useEffect(() => {
    if (isComplete && !celebrated.current) {
      celebrated.current = true;
      const t = setTimeout(() => play("complete"), 200);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  const load = useCallback(async () => {
    try {
      const s = await api<PState>(apiBase);
      setState(s);
      setError(null);
      return s;
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_JOINED") onNotJoined?.();
      else setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiBase, onNotJoined]);

  useEffect(() => {
    // initial data fetch; state is only set after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then((s) => {
      if (s?.activeRun) setView({ kind: "run" });
    });
  }, [load]);

  // heartbeat for "time spent" and "currently working" (only while the tab is visible and in use)
  useEffect(() => {
    const mark = () => (lastInteraction.current = Date.now());
    mark();
    window.addEventListener("keydown", mark);
    window.addEventListener("pointerdown", mark);
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInteraction.current < 90_000) {
        void api(apiBase, { body: { action: "heartbeat" } }).catch(() => {});
      }
    }, 30_000);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("pointerdown", mark);
    };
  }, [apiBase]);

  const startSection = async (key: string) => {
    setBusy(key);
    setError(null);
    try {
      await api(apiBase, { body: { action: "start", sectionKey: key } });
      const s = await load();
      if (s?.activeRun) {
        setView({ kind: "run" });
        window.scrollTo({ top: 0 });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openResult = async (runId: string) => {
    setBusy(runId);
    try {
      const result = await api<RunResult>(apiBase, { body: { action: "result", runId } });
      setView({ kind: "result", result });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    if (preview) return;
    await api(apiBase, { body: { action: "leave" } }).catch(() => {});
    onNotJoined?.();
  };

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (!state)
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-lg font-semibold text-ink-800">{error ?? "Something went wrong."}</p>
        <Button className="mt-4" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    );

  const s = state;
  const showScores = s.assignment.settings.showScores;
  const sectionIndex = (key: string) => s.sections.findIndex((x) => x.key === key);

  if (view.kind === "run" && s.activeRun) {
    const idx = sectionIndex(s.activeRun.sectionKey);
    const sec = s.sections[idx];
    return (
      <Shell preview={preview} onReset={onReset}>
        <RunView
          key={s.activeRun.id}
          apiBase={apiBase}
          run={s.activeRun}
          sectionTitle={sec.title}
          sectionIndex={idx}
          sectionCount={s.sections.length}
          instructions={sec.instructions}
          passPercent={sec.passPercent}
          perQuestion={s.assignment.settings.feedbackTiming === "per_question"}
          onExit={async () => {
            await load();
            setView({ kind: "overview" });
          }}
          onSubmitted={async (r) => {
            await load();
            setView({ kind: "result", result: r as RunResult });
            window.scrollTo({ top: 0 });
          }}
        />
      </Shell>
    );
  }

  if (view.kind === "result") {
    const idx = sectionIndex(view.result.sectionKey);
    const sec = s.sections[idx];
    const next = s.sections[idx + 1];
    return (
      <Shell preview={preview} onReset={onReset}>
        <ResultView
          result={view.result}
          isLastSection={idx === s.sections.length - 1}
          canRetry={sec.canRetry}
          nextRunIsPractice={sec.nextRunIsPractice}
          showScores={showScores}
          onRetry={() => startSection(sec.key)}
          onNext={() => (next ? startSection(next.key) : setView({ kind: "overview" }))}
          onOverview={() => setView({ kind: "overview" })}
        />
      </Shell>
    );
  }

  // ───────── overview ─────────
  const done = s.sections.filter((x) => ["passed", "provisional", "exhausted"].includes(x.status)).length;
  const complete = s.completion === "completed";

  return (
    <Shell preview={preview} onReset={onReset}>
      <div className="mx-auto max-w-3xl pb-16 pt-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-brand-700">{s.assignment.courseName}</div>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight text-ink-900 sm:text-3xl">{s.assignment.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
                if (!sound) setTimeout(() => play("tap"), 50);
              }}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
              aria-pressed={sound}
            >
              {sound ? "🔊 Sound on" : "🔇 Sound off"}
            </button>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-600">
          <span>
            <b className="text-ink-800">{s.student.name}</b>
            {s.student.period && <> · {s.student.period}</>}
          </span>
          {!preview && (
            <>
              <button className="text-brand-700 underline-offset-2 hover:underline" onClick={() => setShowCode((v) => !v)}>
                {showCode ? "Hide resume code" : "Switching devices?"}
              </button>
              <button className="text-ink-500 underline-offset-2 hover:underline" onClick={leave}>
                Not you?
              </button>
            </>
          )}
        </div>
        {showCode && (
          <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[15px] text-brand-900">
            Your resume code is <b className="font-mono text-lg tracking-widest">{s.student.resumeCode}</b>. To continue on another computer, open the assignment there, type your name exactly the same way, and enter this code. Keep it private.
          </div>
        )}

        {!s.assignment.open && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900">{s.assignment.closedReason} You can still look at your results.</div>
        )}

        {complete ? (
          <div className="mt-6 animate-pop overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-emerald-500 p-6 text-white shadow-lg sm:p-8">
            <div className="text-sm font-semibold uppercase tracking-wider text-white/80">Complete</div>
            <h2 className="mt-1 text-3xl font-extrabold">You finished every section!</h2>
            {showScores && s.overallPercent != null && (
              <div className="mt-4 flex items-end gap-3">
                <span className="text-6xl font-black tabular-nums">{Math.round(s.overallPercent)}%</span>
                <span className="mb-2 text-white/85">overall score{s.provisional ? " (suggested — your teacher may adjust written answers)" : ""}</span>
              </div>
            )}
            <p className="mt-3 text-white/90">
              {s.passing === "pending_review"
                ? "Your teacher will review a few written answers. Your work has been turned in."
                : "Your work has been turned in to your teacher. You can close this tab."}
              {s.sections.some((x) => x.canRetry) && showScores && " Want a higher score? You can retry any section below."}
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between text-sm font-semibold text-ink-600">
              <span>Your progress</span>
              <span className="tabular-nums">
                {done} of {s.sections.length} sections
              </span>
            </div>
            <ProgressBar value={(done / Math.max(1, s.sections.length)) * 100} tone="green" className="mt-2 h-3" />
            {s.assignment.directions && <RichText text={s.assignment.directions} className="mt-4 text-[15px] leading-relaxed text-ink-700" />}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-800" role="alert">
            {error}
          </div>
        )}

        <ol className="mt-6 space-y-3">
          {s.sections.map((sec, i) => {
            const ui = STATUS_UI[sec.status];
            const locked = sec.status === "locked";
            const canStart = s.assignment.open && !locked;
            let action: React.ReactNode = null;
            if (sec.status === "in_progress") action = <Button onClick={() => setView({ kind: "run" })}>Continue</Button>;
            else if (sec.status === "available") action = canStart ? <Button onClick={() => startSection(sec.key)} loading={busy === sec.key}>Start</Button> : null;
            else if (sec.status === "failed")
              action = canStart && sec.canRetry ? <Button onClick={() => startSection(sec.key)} loading={busy === sec.key}>Try again</Button> : null;
            const review =
              sec.lastRunId && showScores ? (
                <Button variant="secondary" onClick={() => openResult(sec.lastRunId!)} loading={busy === sec.lastRunId}>
                  Review
                </Button>
              ) : null;
            const improve =
              (sec.status === "passed" || sec.status === "provisional") && sec.canRetry && s.assignment.open && showScores && (sec.bestPercent ?? 0) < 100 ? (
                <Button variant="ghost" onClick={() => startSection(sec.key)} loading={busy === sec.key}>
                  Retry
                </Button>
              ) : null;
            return (
              <li
                key={sec.key}
                className={cx(
                  "flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm transition sm:flex-row sm:items-center sm:p-5",
                  locked ? "border-ink-200/60 opacity-70" : sec.status === "available" || sec.status === "in_progress" ? "border-brand-300 ring-4 ring-brand-500/10" : "border-ink-200",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold", ui.cls)} aria-hidden>
                    {locked ? ui.icon : sec.status === "available" ? i + 1 : ui.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-ink-900">
                        {i + 1}. {sec.title}
                      </h3>
                      <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", ui.cls)}>{ui.label}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-ink-500">
                      {sec.questionCount} questions
                      {sec.passPercent > 0 && <> · pass with {sec.passPercent}%</>}
                      {showScores && sec.bestPercent != null && <> · best {Math.round(sec.bestPercent)}%</>}
                      {sec.runsSubmitted > 0 && <> · {sec.runsSubmitted} {sec.runsSubmitted === 1 ? "try" : "tries"}</>}
                      {sec.maxGradedRuns > 0 && <> · {Math.max(0, sec.maxGradedRuns - sec.gradedRunsUsed)} graded {sec.maxGradedRuns - sec.gradedRunsUsed === 1 ? "try" : "tries"} left</>}
                    </div>
                    {locked && i > 0 && <div className="mt-1 text-sm text-ink-500">Pass “{s.sections[i - 1].title}” to unlock.</div>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {improve}
                  {review}
                  {action}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Shell>
  );
}

function Shell({ children, preview, onReset }: { children: React.ReactNode; preview?: boolean; onReset?: () => void }) {
  return (
    <div className="min-h-screen bg-grid px-4 sm:px-6">
      {preview && (
        <div className="-mx-4 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-1.5 text-sm font-semibold text-amber-950 sm:-mx-6">
          Teacher preview — exactly what students see. Nothing here counts toward results.
          {onReset && (
            <button onClick={onReset} className="rounded-md bg-amber-950/10 px-2 py-0.5 hover:bg-amber-950/20">
              Restart preview
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
