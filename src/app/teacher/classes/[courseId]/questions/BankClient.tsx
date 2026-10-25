"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, cx, useConfirm, useToast } from "@/components/ui";
import { QuestionEditor, blankQuestion, type EditableQuestion } from "@/components/teacher/QuestionEditor";
import { QUESTION_TYPE_LABELS, type QuestionData, type QuestionType } from "@/lib/types";
import { csvToQuestions } from "@/lib/questionCsv";

interface BQ extends EditableQuestion {
  id: string;
  usedIn: { assignmentId: string; title: string }[];
}

const TYPE_TONE: Record<QuestionType, "violet" | "sky" | "brand" | "amber"> = { matching: "violet", fill_blank: "sky", multiple_choice: "brand", short_answer: "amber" };

export function answerSummary(d: QuestionData): string {
  switch (d.type) {
    case "matching": return `→ ${d.match}`;
    case "fill_blank": return `Answer: ${d.answers.join(" / ")}`;
    case "multiple_choice": return `Answer: ${d.choices.find((c) => c.id === d.correctId)?.text ?? "?"}`;
    case "short_answer": return `Rubric: ${d.rubric.map((c) => c.concept).join(" · ")}`;
  }
}

export function BankClient({ courseId, questions, units, courses, archived }: { courseId: string; questions: BQ[]; units: { id: string; name: string }[]; courses: { id: string; name: string }[]; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState("");
  const [diff, setDiff] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditableQuestion | null>(null);
  const [bulk, setBulk] = useState<"" | "set" | "copy">("");
  const [bulkF, setBulkF] = useState({ topic: "", difficulty: "", unitId: "__keep", points: "", target: courses[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);

  const topics = useMemo(() => [...new Set(questions.map((q) => q.topic).filter(Boolean))].sort(), [questions]);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return questions.filter(
      (q) =>
        (!type || q.type === type) &&
        (!unit || (unit === "none" ? !q.unitId : q.unitId === unit)) &&
        (!topic || q.topic === topic) &&
        (!diff || q.difficulty === diff) &&
        (!s || `${q.prompt} ${q.topic} ${q.explanation} ${JSON.stringify(q.data)}`.toLowerCase().includes(s)),
    );
  }, [questions, search, type, unit, topic, diff]);

  const allSelected = list.length > 0 && list.every((q) => sel.has(q.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const runBulk = async (action: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const r = await api<{ count: number }>(`/api/teacher/courses/${courseId}/questions/bulk`, { body: { ids: [...sel], action } });
      toast(`${msg} ${r.count} question${r.count === 1 ? "" : "s"}`);
      setSel(new Set());
      setBulk("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async (ids: string[]) => {
    const used = questions.filter((q) => ids.includes(q.id) && q.usedIn.length);
    const ok = await confirm({
      title: ids.length === 1 ? "Delete this question?" : `Delete ${ids.length} questions?`,
      message: `${used.length ? `⚠ ${used.length} of these ${used.length === 1 ? "is" : "are"} used in assignment drafts and will be removed from them.\n` : ""}Published versions and student grades are NOT affected — they keep their own frozen copy.\nTip: “Archive” hides questions without deleting them.`,
      confirmLabel: "Delete",
      danger: true,
      typeToConfirm: ids.length > 5 ? "DELETE" : undefined,
    });
    if (!ok) return;
    if (ids.length === 1) {
      try {
        await api(`/api/teacher/questions/${ids[0]}`, { method: "DELETE" });
        toast("Question deleted");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    } else await runBulk({ kind: "delete" }, "Deleted");
  };

  const duplicate = async (id: string) => {
    try {
      await api(`/api/teacher/questions/${id}/duplicate`, { body: {} });
      toast("Duplicated");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    let items: unknown[] = [];
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const j = JSON.parse(text);
        items = Array.isArray(j) ? j : j.questions ?? [];
      } catch {
        return toast("That JSON file couldn't be read.", "error");
      }
    } else {
      const { questions: qs, errors } = csvToQuestions(text);
      if (errors.length) return toast(`Nothing imported. Fix these rows:\n${errors.slice(0, 6).join("\n")}`, "error");
      items = qs;
    }
    try {
      const r = await api<{ count: number }>(`/api/teacher/courses/${courseId}/questions/import`, { body: { questions: items } });
      toast(`Imported ${r.count} questions`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-ink-600">
          {archived ? "Archived questions" : `${questions.length} questions in this class's bank`}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={archived ? `/teacher/classes/${courseId}/questions` : `/teacher/classes/${courseId}/questions?archived=1`}>
            <Button variant="secondary">{archived ? "← Active questions" : "Archived"}</Button>
          </Link>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import</Button>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <a href={`/api/teacher/courses/${courseId}/questions/export?format=csv`}><Button variant="secondary">Export CSV</Button></a>
          <a href={`/api/teacher/courses/${courseId}/questions/export`}><Button variant="secondary">Export JSON</Button></a>
          {!archived && <Button onClick={() => setEditing(blankQuestion("multiple_choice"))}>+ New question</Button>}
        </div>
      </div>

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-[2fr_repeat(4,1fr)]">
        <Input placeholder="Search questions, answers, explanations…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
        </Select>
        <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
          <option value="">All units</option>
          <option value="none">No unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={diff} onChange={(e) => setDiff(e.target.value)} aria-label="Difficulty">
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>
      </Card>

      {sel.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-lg">
          <span className="mr-2 font-semibold">{sel.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setBulk("set")}>Edit topic / difficulty / unit / points</Button>
          {courses.length > 0 && <Button size="sm" variant="secondary" onClick={() => setBulk("copy")}>Copy to another class</Button>}
          <a href={`/api/teacher/courses/${courseId}/questions/export?format=csv&ids=${[...sel].join(",")}`}><Button size="sm" variant="secondary">Export</Button></a>
          <Button size="sm" variant="secondary" onClick={() => runBulk({ kind: archived ? "unarchive" : "archive" }, archived ? "Restored" : "Archived")}>{archived ? "Unarchive" : "Archive"}</Button>
          <Button size="sm" variant="danger" onClick={() => del([...sel])}>Delete</Button>
          <button className="ml-auto text-sm text-white/70 hover:text-white" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState title={questions.length ? "No questions match these filters" : "Your question bank is empty"} action={!questions.length && !archived && <Button onClick={() => setEditing(blankQuestion("multiple_choice"))}>Write your first question</Button>}>
          {!questions.length && "Write questions here once and reuse them in any assignment. You can also import a spreadsheet (CSV)."}
        </EmptyState>
      ) : (
        <Card className="divide-y divide-ink-100">
          <label className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-500">
            <input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(list.map((q) => q.id)))} />
            Select all {list.length} shown
          </label>
          {list.map((q) => (
            <div key={q.id} className={cx("flex gap-3 px-4 py-3.5", sel.has(q.id) && "bg-brand-50/50")}>
              <input type="checkbox" className="mt-1.5 h-4 w-4" checked={sel.has(q.id)} onChange={() => toggle(q.id)} aria-label="Select question" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TYPE_TONE[q.type]}>{QUESTION_TYPE_LABELS[q.type]}</Badge>
                  {q.topic && <Badge>{q.topic}</Badge>}
                  <span className="text-xs text-ink-500">{q.difficulty} · {q.points} pt{q.points === 1 ? "" : "s"}</span>
                  {q.usedIn.length > 0 && <span className="text-xs text-ink-500">· used in {q.usedIn.length} assignment{q.usedIn.length === 1 ? "" : "s"}</span>}
                </div>
                <button className="mt-1 block w-full text-left font-semibold text-ink-900 hover:text-brand-700" onClick={() => setEditing(q)}>
                  <span className="line-clamp-2 whitespace-pre-line">{q.prompt}</span>
                </button>
                <div className="mt-0.5 line-clamp-1 text-sm text-ink-500">{answerSummary(q.data)}</div>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(q)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => duplicate(q.id)}>Duplicate</Button>
                <Button size="sm" variant="ghost" onClick={() => del([q.id])} aria-label="Delete">🗑</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="mt-4 text-sm text-ink-500">
        Spreadsheet import columns: Type, Question, Correct Answer, Other Choices / Alternatives (separate with |), Rejected Answers, Rubric, Explanation, Topic, Difficulty, Points, Unit. Export a CSV first to get a ready-made template.
      </p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit question" : "New question"} wide>
        {editing && (
          <QuestionEditor
            courseId={courseId}
            initial={editing}
            units={units}
            topics={topics}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
        {editing?.id && (questions.find((q) => q.id === editing.id)?.usedIn.length ?? 0) > 0 && (
          <p className="mt-3 text-sm text-ink-500">
            Used in: {questions.find((q) => q.id === editing.id)!.usedIn.map((u) => u.title).join(", ")}. Students keep seeing the published version until you republish.
          </p>
        )}
      </Modal>

      <Modal open={bulk === "set"} onClose={() => setBulk("")} title={`Edit ${sel.size} questions`}>
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Leave a field blank to keep each question&apos;s current value.</p>
          <div><Label>Topic</Label><Input list="bulk-topics" value={bulkF.topic} onChange={(e) => setBulkF({ ...bulkF, topic: e.target.value })} /><datalist id="bulk-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Difficulty</Label><Select value={bulkF.difficulty} onChange={(e) => setBulkF({ ...bulkF, difficulty: e.target.value })}><option value="">Keep</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></div>
            <div><Label>Unit</Label><Select value={bulkF.unitId} onChange={(e) => setBulkF({ ...bulkF, unitId: e.target.value })}><option value="__keep">Keep</option><option value="">No unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></div>
            <div><Label>Points</Label><Input type="number" min={0} value={bulkF.points} onChange={(e) => setBulkF({ ...bulkF, points: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBulk("")}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() =>
                runBulk(
                  {
                    kind: "set",
                    ...(bulkF.topic ? { topic: bulkF.topic } : {}),
                    ...(bulkF.difficulty ? { difficulty: bulkF.difficulty } : {}),
                    ...(bulkF.unitId !== "__keep" ? { unitId: bulkF.unitId || null } : {}),
                    ...(bulkF.points !== "" ? { points: Number(bulkF.points) } : {}),
                  },
                  "Updated",
                )
              }
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulk === "copy"} onClose={() => setBulk("")} title={`Copy ${sel.size} questions`}>
        <div className="space-y-3">
          <Label>Copy into class</Label>
          <Select value={bulkF.target} onChange={(e) => setBulkF({ ...bulkF, target: e.target.value })}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <p className="text-sm text-ink-500">Copies are independent — editing one won&apos;t change the other.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBulk("")}>Cancel</Button>
            <Button loading={busy} onClick={() => runBulk({ kind: "copy", targetCourseId: bulkF.target }, "Copied")}>Copy</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
