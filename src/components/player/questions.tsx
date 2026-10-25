"use client";

import { useEffect, useRef, useState } from "react";
import { RichText, withBlank } from "@/components/RichText";
import { cx } from "@/components/ui";
import { play } from "./sound";

export type Answer = { choiceId?: string | null; choice?: string | null; text?: string };

export interface PQuestion {
  key: string;
  type: "matching" | "fill_blank" | "multiple_choice" | "short_answer";
  prompt: string;
  points: number;
  choices?: { id: string; text: string }[];
  groupId?: string;
}
export interface PGroup {
  id: string;
  keys: string[];
  options: { id: string; text: string }[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function MultipleChoice({ q, value, onChange, locked }: { q: PQuestion; value?: Answer; onChange: (a: Answer) => void; locked?: boolean }) {
  const sel = value?.choiceId ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (locked || !q.choices) return;
    const idx = q.choices.findIndex((c) => c.id === sel);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const n = q.choices[(idx + 1) % q.choices.length];
      onChange({ choiceId: n.id });
      (ref.current?.querySelector(`[data-id="${n.id}"]`) as HTMLElement)?.focus();
    }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = q.choices[(idx - 1 + q.choices.length) % q.choices.length];
      onChange({ choiceId: n.id });
      (ref.current?.querySelector(`[data-id="${n.id}"]`) as HTMLElement)?.focus();
    }
  };
  return (
    <div ref={ref} role="radiogroup" aria-label="Answer choices" className="mt-5 grid gap-3" onKeyDown={onKey}>
      {q.choices?.map((c, i) => {
        const on = sel === c.id;
        return (
          <button
            key={c.id}
            data-id={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!sel && i === 0) ? 0 : -1}
            disabled={locked}
            onClick={() => {
              play("tap");
              onChange({ choiceId: c.id });
            }}
            className={cx(
              "group flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left text-[17px] transition-all",
              on ? "border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40",
              locked && "cursor-default opacity-80",
            )}
          >
            <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition", on ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 group-hover:bg-brand-100")}>
              {LETTERS[i]}
            </span>
            <span className="leading-snug text-ink-800">{c.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FillBlank({ q, value, onChange, locked, onEnter, autoFocus }: { q: PQuestion; value?: Answer; onChange: (a: Answer) => void; locked?: boolean; onEnter?: () => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, q.key]);
  return (
    <div className="mt-5">
      <label className="sr-only" htmlFor={`fib-${q.key}`}>
        Your answer
      </label>
      <input
        ref={ref}
        id={`fib-${q.key}`}
        value={value?.text ?? ""}
        disabled={locked}
        maxLength={300}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
        placeholder="Type your answer…"
        className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-5 text-xl text-ink-900 transition placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50"
      />
      <p className="mt-2 text-sm text-ink-500">Capitalization doesn&apos;t matter. Press Enter for the next question.</p>
    </div>
  );
}

export function ShortAnswer({ q, value, onChange, locked, autoFocus }: { q: PQuestion; value?: Answer; onChange: (a: Answer) => void; locked?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, q.key]);
  const text = value?.text ?? "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="mt-5">
      <label className="sr-only" htmlFor={`sa-${q.key}`}>
        Your answer
      </label>
      <textarea
        ref={ref}
        id={`sa-${q.key}`}
        value={text}
        disabled={locked}
        maxLength={5000}
        rows={6}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Explain in your own words. Use complete sentences."
        className="w-full rounded-2xl border-2 border-ink-200 bg-white px-5 py-4 text-lg leading-relaxed text-ink-900 transition placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50"
      />
      <div className="mt-1 flex justify-between text-sm text-ink-500">
        <span>Spelling and capitalization won&apos;t cost you points — your ideas matter.</span>
        <span className="tabular-nums">{words} words</span>
      </div>
    </div>
  );
}

/** Matching board: pick a definition for each term (dropdown) or tap a term, then tap a definition. */
export function MatchingBoard({
  group,
  questions,
  answers,
  onChange,
  lockedKeys,
}: {
  group: PGroup;
  questions: PQuestion[];
  answers: Record<string, Answer | undefined>;
  onChange: (key: string, a: Answer) => void;
  lockedKeys?: Set<string>;
}) {
  const [active, setActive] = useState<string | null>(questions[0]?.key ?? null);
  const used = new Map<string, string>(); // option → term key
  for (const q of questions) {
    const c = answers[q.key]?.choice;
    if (c) used.set(c, q.key);
  }
  const letter = (optId: string) => LETTERS[group.options.findIndex((o) => o.id === optId)] ?? "?";
  const assign = (termKey: string, optId: string | null) => {
    if (lockedKeys?.has(termKey)) return;
    play("tap");
    onChange(termKey, { choice: optId });
    // advance to the next unmatched term
    const next = questions.find((q) => q.key !== termKey && !answers[q.key]?.choice && !lockedKeys?.has(q.key));
    if (optId && next) setActive(next.key);
  };
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Terms</h3>
        <ul className="space-y-2.5" aria-label="Terms">
          {questions.map((q) => {
            const val = answers[q.key]?.choice ?? "";
            const isActive = active === q.key;
            const locked = lockedKeys?.has(q.key);
            return (
              <li
                key={q.key}
                onClick={() => setActive(q.key)}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border-2 bg-white p-3 transition",
                  isActive ? "border-brand-500 shadow-md shadow-brand-500/10" : val ? "border-emerald-200" : "border-ink-200",
                )}
              >
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold", val ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-400")}>
                  {val ? letter(val) : "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <RichText text={q.prompt} className="text-[17px] font-semibold text-ink-800" />
                  {val && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-500">{group.options.find((o) => o.id === val)?.text}</span>}
                </span>
                <label className="sr-only" htmlFor={`m-${q.key}`}>
                  Match for {q.prompt}
                </label>
                <select
                  id={`m-${q.key}`}
                  value={val}
                  disabled={locked}
                  onFocus={() => setActive(q.key)}
                  onChange={(e) => assign(q.key, e.target.value || null)}
                  className="h-10 w-20 shrink-0 rounded-xl border border-ink-200 bg-ink-50 px-2 text-base font-semibold text-ink-800 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {group.options.map((o, i) => (
                    <option key={o.id} value={o.id}>
                      {LETTERS[i]}
                      {used.has(o.id) && used.get(o.id) !== q.key ? " (used)" : ""}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Definitions <span className="font-normal normal-case tracking-normal">— tap one to match it with the highlighted term</span>
        </h3>
        <ul className="space-y-2" aria-label="Definitions">
          {group.options.map((o, i) => {
            const owner = used.get(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => active && assign(active, owner === active ? null : o.id)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition",
                    owner ? "border-ink-100 bg-ink-50 text-ink-500" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/50",
                    owner && owner === active && "border-brand-400 bg-brand-50 text-ink-800",
                  )}
                >
                  <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold", owner ? "bg-ink-200 text-ink-600" : "bg-brand-100 text-brand-700")}>{LETTERS[i]}</span>
                  <span className="text-[15px] leading-snug">{o.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function PromptText({ q }: { q: PQuestion }) {
  return <RichText text={q.type === "fill_blank" ? withBlank(q.prompt) : q.prompt} className="text-xl font-semibold leading-relaxed text-ink-900 sm:text-[22px]" />;
}

export function isAnswered(q: PQuestion, a?: Answer) {
  if (!a) return false;
  if (q.type === "multiple_choice") return !!a.choiceId;
  if (q.type === "matching") return !!a.choice;
  return !!a.text?.trim();
}
