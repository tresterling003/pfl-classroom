"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Input, Label, Select, Textarea, Toggle, cx, useToast } from "@/components/ui";
import { RichText, withBlank } from "@/components/RichText";
import { gradeFillBlank } from "@/lib/grading/objective";
import { gradeShortAnswerRubric } from "@/lib/grading/rubric";
import { questionInputSchema, questionProblems } from "@/lib/questionSchema";
import { QUESTION_TYPE_LABELS, type QuestionData, type QuestionType, type RubricCriterion } from "@/lib/types";

export interface EditableQuestion {
  id?: string;
  type: QuestionType;
  prompt: string;
  data: QuestionData;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  unitId: string | null;
  tags?: string[];
}

let uid = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

export function blankData(type: QuestionType): QuestionData {
  switch (type) {
    case "matching":
      return { type, match: "", distractors: [] };
    case "fill_blank":
      return { type, answers: [""], rejected: [], allowTypos: true };
    case "multiple_choice":
      return { type, choices: ["a", "b", "c", "d"].map((id) => ({ id, text: "" })), correctId: "a", shuffle: true };
    case "short_answer":
      return { type, rubric: [{ id: "c1", concept: "", points: 1, phrases: [] }], sampleAnswer: "", misconceptions: [], minWords: 6 };
  }
}

export function blankQuestion(type: QuestionType, unitId: string | null = null, topic = ""): EditableQuestion {
  return { type, prompt: "", data: blankData(type), explanation: "", topic, difficulty: "medium", points: 1, unitId };
}

/** Editable list of short strings (answers, distractors, phrases). */
function ListEditor({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">
            ✕
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...items, ""])}>
        + {addLabel}
      </Button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
      <div className="mb-3">
        <div className="font-bold text-ink-900">{title}</div>
        {hint && <div className="text-sm text-ink-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function FibTester({ data }: { data: Extract<QuestionData, { type: "fill_blank" }> }) {
  const [t, setT] = useState("");
  const r = t.trim() ? gradeFillBlank({ ...data, answers: data.answers.filter((a) => a.trim()) }, t) : null;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-ink-300 bg-white p-3">
      <Label>Test a student answer</Label>
      <div className="flex items-center gap-3">
        <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Type what a student might write…" />
        {r && <Badge tone={r.score ? "green" : "red"}>{r.score ? "Accepted" : "Marked wrong"}</Badge>}
      </div>
      {r?.detail.note && <div className="mt-1 text-sm text-ink-500">{r.detail.note}</div>}
    </div>
  );
}

function RubricTester({ data }: { data: Extract<QuestionData, { type: "short_answer" }> }) {
  const [t, setT] = useState("");
  const r = useMemo(() => (t.trim() ? gradeShortAnswerRubric(data, t) : null), [t, data]);
  return (
    <div className="mt-3 rounded-xl border border-dashed border-ink-300 bg-white p-3">
      <Label hint="(uses the automatic rubric grader — AI grading, if turned on, judges meaning more flexibly)">Test a student answer</Label>
      <Textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Paste or type a sample student answer…" />
      {r && (
        <div className="mt-2 space-y-1 text-sm">
          <div className="font-semibold">
            Suggested score: {Math.round(r.score * 100)}% {r.needsReview && <Badge tone="amber">would be flagged for your review</Badge>}
          </div>
          {r.detail.criteria?.map((c) => (
            <div key={c.id} className={c.met ? "text-emerald-700" : "text-ink-500"}>
              {c.met ? "✓" : "○"} {c.concept || "(unnamed idea)"} {c.evidence && <span className="text-ink-400">— found “{c.evidence}”</span>}
            </div>
          ))}
          {r.detail.flags?.map((f, i) => (
            <div key={i} className="text-amber-700">⚑ {f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuestionEditor({
  courseId,
  initial,
  units,
  topics,
  onSaved,
  onCancel,
}: {
  courseId: string;
  initial: EditableQuestion;
  units: { id: string; name: string }[];
  topics: string[];
  onSaved: (q: EditableQuestion & { id: string }) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState<EditableQuestion>(initial);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof EditableQuestion>(k: K, v: EditableQuestion[K]) => setQ((x) => ({ ...x, [k]: v }));
  const setData = (d: QuestionData) => setQ((x) => ({ ...x, data: d }));
  const d = q.data;

  const changeType = (t: QuestionType) => {
    if (t === q.type) return;
    setQ((x) => ({ ...x, type: t, data: blankData(t) }));
  };

  const save = async () => {
    const payload = { ...q, data: cleanData(q.data) };
    const parsed = questionInputSchema.safeParse(payload);
    const probs = parsed.success ? questionProblems(parsed.data) : parsed.error.issues.map((i) => `${i.path.join(" › ")}: ${i.message}`);
    setProblems(probs);
    if (probs.length) return;
    setBusy(true);
    try {
      const saved = q.id
        ? await api<EditableQuestion & { id: string }>(`/api/teacher/questions/${q.id}`, { method: "PUT", body: payload })
        : await api<EditableQuestion & { id: string }>(`/api/teacher/courses/${courseId}/questions`, { body: payload });
      toast("Question saved");
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label htmlFor="qtype">Question type</Label>
          <Select id="qtype" value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Hide student preview" : "Student preview"}
        </Button>
      </div>

      {showPreview && (
        <div className="rounded-2xl border-2 border-brand-200 bg-white p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">What students see</div>
          <RichText text={q.type === "fill_blank" ? withBlank(q.prompt || "…") : q.prompt || "…"} className="text-lg font-semibold text-ink-900" />
          {d.type === "multiple_choice" && (
            <div className="mt-3 grid gap-2">
              {d.choices.map((c, i) => (
                <div key={c.id} className="rounded-xl border border-ink-200 px-3 py-2">
                  <b className="mr-2 text-ink-500">{"ABCDEFGH"[i]}</b>
                  {c.text || "…"}
                </div>
              ))}
              {d.shuffle !== false && <div className="text-xs text-ink-500">Order is shuffled for each student.</div>}
            </div>
          )}
          {d.type === "matching" && <div className="mt-3 text-sm text-ink-600">Students pick “{d.match || "…"}” from a list of all definitions in this matching group.</div>}
          {d.type === "fill_blank" && <div className="mt-3 h-11 rounded-xl border-2 border-ink-200" />}
          {d.type === "short_answer" && <div className="mt-3 h-24 rounded-xl border-2 border-ink-200" />}
        </div>
      )}

      <div>
        <Label htmlFor="qprompt" hint={q.type === "matching" ? "(the term students match)" : q.type === "fill_blank" ? "— put ___ (3 underscores) where the blank goes" : undefined}>
          {q.type === "matching" ? "Term" : "Question"}
        </Label>
        <Textarea id="qprompt" rows={q.type === "matching" ? 1 : 3} value={q.prompt} onChange={(e) => set("prompt", e.target.value)} />
        <p className="mt-1 text-xs text-ink-500">
          Tip: make a table with lines like <code>| Price | Quantity |</code>. Leave a blank line before and after it. Use **bold** for emphasis.
        </p>
      </div>

      {d.type === "matching" && (
        <Section title="Correct match" hint="The definition or example that goes with this term. Other matching questions in the same section become the other choices.">
          <Textarea rows={2} value={d.match} onChange={(e) => setData({ ...d, match: e.target.value })} />
          <div className="mt-3">
            <Label hint="(optional — extra wrong choices shown on the board)">Extra distractors</Label>
            <ListEditor items={d.distractors ?? []} onChange={(v) => setData({ ...d, distractors: v })} placeholder="A tempting wrong definition" addLabel="Add distractor" />
          </div>
        </Section>
      )}

      {d.type === "fill_blank" && (
        <Section title="Accepted answers" hint="Capitalization, extra spaces, punctuation, “the/a”, and simple plurals are always ignored. Add other wordings you want to accept.">
          <ListEditor items={d.answers} onChange={(v) => setData({ ...d, answers: v })} placeholder="e.g. resource market" addLabel="Add accepted answer" />
          <div className="mt-4">
            <Label hint="(never accepted, even if spelled close — e.g. product market)">Wrong answers to block</Label>
            <ListEditor items={d.rejected ?? []} onChange={(v) => setData({ ...d, rejected: v })} placeholder="e.g. product market" addLabel="Add blocked answer" />
          </div>
          <div className="mt-4">
            <Toggle checked={d.allowTypos !== false} onChange={(v) => setData({ ...d, allowTypos: v })} label="Forgive small spelling slips" description="One wrong letter on words of 5+ letters (two on 10+). Never applies to numbers or opposite words like increase/decrease." />
          </div>
          <FibTester data={d} />
        </Section>
      )}

      {d.type === "multiple_choice" && (
        <Section title="Answer choices" hint="Click the circle next to the correct answer.">
          <div className="space-y-2" role="radiogroup" aria-label="Correct answer">
            {d.choices.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={d.correctId === c.id}
                  aria-label={`Mark choice ${i + 1} correct`}
                  onClick={() => setData({ ...d, correctId: c.id })}
                  className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold", d.correctId === c.id ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300 text-ink-400")}
                >
                  {d.correctId === c.id ? "✓" : "ABCDEFGH"[i]}
                </button>
                <Input value={c.text} onChange={(e) => setData({ ...d, choices: d.choices.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} placeholder={`Choice ${i + 1}`} />
                <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => setData({ ...d, choices: move(d.choices, i, i - 1) })} aria-label="Move up">
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={d.choices.length <= 2}
                  onClick={() => {
                    const choices = d.choices.filter((x) => x.id !== c.id);
                    setData({ ...d, choices, correctId: d.correctId === c.id ? choices[0].id : d.correctId });
                  }}
                  aria-label="Remove choice"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button type="button" variant="secondary" size="sm" disabled={d.choices.length >= 8} onClick={() => setData({ ...d, choices: [...d.choices, { id: newId("x"), text: "" }] })}>
              + Add choice
            </Button>
            <Toggle checked={d.shuffle !== false} onChange={(v) => setData({ ...d, shuffle: v })} label="Allow shuffling" description="Turn off for “All of the above”." />
          </div>
        </Section>
      )}

      {d.type === "short_answer" && (
        <Section title="Rubric" hint="List the ideas a full-credit answer includes. Each idea earns its points. For each idea, list a few ways students might say it — the automatic grader looks for these (any order, capitalization ignored, small typos OK).">
          <div className="space-y-3">
            {d.rubric.map((c, i) => (
              <RubricRow
                key={c.id}
                c={c}
                index={i}
                onChange={(nc) => setData({ ...d, rubric: d.rubric.map((x) => (x.id === c.id ? nc : x)) })}
                onRemove={d.rubric.length > 1 ? () => setData({ ...d, rubric: d.rubric.filter((x) => x.id !== c.id) }) : undefined}
              />
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setData({ ...d, rubric: [...d.rubric, { id: newId("c"), concept: "", points: 1, phrases: [] }] })}>
            + Add rubric idea
          </Button>
          <div className="mt-4">
            <Label hint="(shown to students after they pass, if answers are revealed)">Example full-credit answer</Label>
            <Textarea rows={3} value={d.sampleAnswer} onChange={(e) => setData({ ...d, sampleAnswer: e.target.value })} />
          </div>
          <div className="mt-4">
            <Label hint="(answers containing these get flagged for your review)">Common misconceptions</Label>
            <ListEditor items={d.misconceptions ?? []} onChange={(v) => setData({ ...d, misconceptions: v })} placeholder="e.g. demand curve slopes upward" addLabel="Add misconception" />
          </div>
          <div className="mt-4 w-48">
            <Label hint="(shorter answers get flagged)">Minimum words</Label>
            <Input type="number" min={0} value={d.minWords ?? 6} onChange={(e) => setData({ ...d, minWords: Number(e.target.value) || 0 })} />
          </div>
          <RubricTester data={cleanData(d) as Extract<QuestionData, { type: "short_answer" }>} />
        </Section>
      )}

      <div>
        <Label htmlFor="qexp" hint="(shown after students answer — teach the idea, don't just restate the answer)">
          Explanation
        </Label>
        <Textarea id="qexp" rows={3} value={q.explanation} onChange={(e) => set("explanation", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="qtopic">Topic</Label>
          <Input id="qtopic" list="topic-list" value={q.topic} onChange={(e) => set("topic", e.target.value)} />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="qunit">Unit</Label>
          <Select id="qunit" value={q.unitId ?? ""} onChange={(e) => set("unitId", e.target.value || null)}>
            <option value="">No unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qdiff">Difficulty</Label>
          <Select id="qdiff" value={q.difficulty} onChange={(e) => set("difficulty", e.target.value as EditableQuestion["difficulty"])}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="qpts">Points</Label>
          <Input id="qpts" type="number" min={0} step={0.5} value={q.points} onChange={(e) => set("points", Number(e.target.value))} />
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">
          {problems.map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-ink-100 bg-white px-6 py-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={save} loading={busy}>
          {q.id ? "Save changes" : "Save question"}
        </Button>
      </div>
    </div>
  );
}

function RubricRow({ c, index, onChange, onRemove }: { c: RubricCriterion; index: number; onChange: (c: RubricCriterion) => void; onRemove?: () => void }) {
  const [phrasesText, setPhrasesText] = useState(c.phrases.join("\n"));
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>Idea {index + 1}</Label>
          <Input value={c.concept} onChange={(e) => onChange({ ...c, concept: e.target.value })} placeholder="When price goes up, quantity demanded goes down" />
        </div>
        <div className="w-24">
          <Label>Points</Label>
          <Input type="number" min={0} step={0.5} value={c.points} onChange={(e) => onChange({ ...c, points: Number(e.target.value) })} />
        </div>
        {onRemove && (
          <Button type="button" variant="ghost" className="mt-6" onClick={onRemove} aria-label="Remove idea">
            ✕
          </Button>
        )}
      </div>
      <div className="mt-2">
        <Label hint="(one per line — all important words in a line must appear)">Ways students might say it</Label>
        <Textarea
          rows={3}
          value={phrasesText}
          onChange={(e) => {
            setPhrasesText(e.target.value);
            onChange({ ...c, phrases: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) });
          }}
          placeholder={"price goes up buy less\nhigher price fewer\nlaw of demand"}
        />
      </div>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

/** Drop empty list entries before saving. */
function cleanData(d: QuestionData): QuestionData {
  switch (d.type) {
    case "fill_blank":
      return { ...d, answers: d.answers.map((a) => a.trim()).filter(Boolean), rejected: (d.rejected ?? []).map((a) => a.trim()).filter(Boolean) };
    case "matching":
      return { ...d, distractors: (d.distractors ?? []).map((a) => a.trim()).filter(Boolean) };
    case "short_answer":
      return { ...d, misconceptions: (d.misconceptions ?? []).map((a) => a.trim()).filter(Boolean) };
    default:
      return d;
  }
}
