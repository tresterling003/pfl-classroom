"use client";
import { LocalTime } from "@/components/LocalTime";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, Input, Label, Modal, Select, Textarea, Toggle, cx, useConfirm, useToast } from "@/components/ui";
import { PageHeader, StatusBadge } from "@/components/teacher/PageHeader";
import { QuestionEditor, blankQuestion, type EditableQuestion } from "@/components/teacher/QuestionEditor";
import { answerSummary } from "@/app/teacher/classes/[courseId]/questions/BankClient";
import { QUESTION_TYPE_LABELS, type AssignmentSettings, type QuestionData, type QuestionType } from "@/lib/types";

interface Q { id: string; type: QuestionType; prompt: string; data: QuestionData; explanation: string; topic: string; difficulty: "easy" | "medium" | "hard"; points: number; unitId: string | null }
interface Sec { id: string; title: string; instructions: string; sortOrder: number; settings: { passPercent?: number | null; drawCount?: number | null }; questions: Q[] }
interface Detail {
  assignment: { id: string; courseId: string; unitId: string | null; title: string; kind: string; directions: string; settings: AssignmentSettings; status: string; joinCode: string; opensAt: string | null; closesAt: string | null; currentVersionId: string | null; hasUnpublishedChanges: boolean; archivedAt: string | null };
  course: { id: string; name: string };
  sections: Sec[];
  periodIds: string[];
  versions: { id: string; versionNumber: number; publishedAt: string }[];
}

type Tab = "questions" | "settings" | "share";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BuilderClient({ detail, units, periods, bank, courses, aiOn }: { detail: Detail; units: { id: string; name: string }[]; periods: { id: string; name: string }[]; bank: Q[]; courses: { id: string; name: string }[]; aiOn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const a = detail.assignment;
  const [tab, setTab] = useState<Tab>("questions");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ q: EditableQuestion; sectionId?: string } | null>(null);
  const [picker, setPicker] = useState<Sec | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const topics = useMemo(() => [...new Set(bank.map((q) => q.topic).filter(Boolean))].sort(), [bank]);
  const totalQ = detail.sections.reduce((s, x) => s + x.questions.length, 0);
  const live = a.status === "published";

  const call = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast(ok);
      router.refresh();
      return r;
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const setQuestions = (sectionId: string, ids: string[]) => call(`sq-${sectionId}`, () => api(`/api/teacher/sections/${sectionId}/questions`, { method: "PUT", body: { questionIds: ids } }));

  const publish = async () => {
    setBusy("publish");
    setProblems([]);
    try {
      const r = await api<{ newVersion: number | null }>(`/api/teacher/assignments/${a.id}/actions`, { body: { action: "publish" } });
      toast(r.newVersion && r.newVersion > 1 ? `Published version ${r.newVersion}. Students who already started keep their version.` : "Published! Share the code with your students.");
      setTab("share");
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("Can't publish")) setProblems(msg.split("\n").slice(1));
      else toast(msg, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[
          { href: `/teacher/classes/${a.courseId}`, label: detail.course.name },
        ]}
        title={a.title}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} archived={!!a.archivedAt} changes={a.hasUnpublishedChanges && !!a.currentVersionId} />
            <span>{totalQ} questions in {detail.sections.length} sections</span>
            {live && (
              <span>
                · Code <b className="font-mono tracking-wider text-ink-900">{a.joinCode}</b>
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Link href={`/teacher/assignments/${a.id}/preview`}>
              <Button variant="secondary">Preview as student</Button>
            </Link>
            <Link href={`/teacher/assignments/${a.id}/results`}>
              <Button variant="secondary">Results</Button>
            </Link>
            {(!live || a.hasUnpublishedChanges) && (
              <Button onClick={publish} loading={busy === "publish"} variant="success">
                {a.currentVersionId ? (live ? "Publish changes" : "Re-open & publish") : "Publish"}
              </Button>
            )}
          </>
        }
      />

      {live && a.hasUnpublishedChanges && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
          You have edits students can&apos;t see yet. Press <b>Publish changes</b> to release them. Students who already started keep their original version, so their grades never change unexpectedly.
        </div>
      )}
      {problems.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900" role="alert">
          <b>Fix these before publishing:</b>
          <ul className="mt-1 list-disc pl-5 text-[15px]">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-ink-200">
        {(["questions", "settings", "share"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 px-4 py-2.5 text-[15px] font-semibold", tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")}>
            {t === "questions" ? "Sections & questions" : t === "settings" ? "Settings & rules" : "Share & publish"}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <div className="space-y-5">
          {detail.sections.map((s, si) => (
            <SectionCard
              key={`${s.id}:${s.title}:${s.instructions}`}
              s={s}
              index={si}
              count={detail.sections.length}
              passDefault={a.settings.passPercent}
              busy={busy === `sq-${s.id}`}
              onMove={(dir) => {
                const ids = detail.sections.map((x) => x.id);
                const [x] = ids.splice(si, 1);
                ids.splice(si + dir, 0, x);
                void call("order", () => api(`/api/teacher/assignments/${a.id}/sections`, { method: "PUT", body: { sectionIds: ids } }));
              }}
              onUpdate={(patch) => call(`s-${s.id}`, () => api(`/api/teacher/sections/${s.id}`, { method: "PATCH", body: patch }), "Saved")}
              onDelete={async () => {
                if (await confirm({ title: `Delete section “${s.title}”?`, message: "Its questions stay in your question bank. Published versions are not affected.", danger: true, confirmLabel: "Delete section" }))
                  void call(`s-${s.id}`, () => api(`/api/teacher/sections/${s.id}`, { method: "DELETE" }), "Section deleted");
              }}
              onSetQuestions={(ids) => setQuestions(s.id, ids)}
              onEdit={(q) => setEditing({ q })}
              onAddFromBank={() => setPicker(s)}
              onNew={() => {
                const t = (s.questions[0]?.type ?? guessType(s.title)) as QuestionType;
                setEditing({ q: blankQuestion(t, a.unitId, s.questions[0]?.topic ?? ""), sectionId: s.id });
              }}
            />
          ))}
          <Button
            variant="secondary"
            onClick={() => call("addsec", () => api(`/api/teacher/assignments/${a.id}/sections`, { body: { title: `Section ${detail.sections.length + 1}` } }), "Section added")}
            loading={busy === "addsec"}
          >
            + Add section
          </Button>
        </div>
      )}

      {tab === "settings" && <SettingsForm detail={detail} units={units} periods={periods} aiOn={aiOn} />}

      {tab === "share" && <SharePanel detail={detail} courses={courses} onPublish={publish} publishing={busy === "publish"} />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.q.id ? "Edit question" : "New question"} wide>
        {editing && (
          <>
            {editing.q.id && <p className="mb-4 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-600">This edits the question in your class question bank (and every draft that uses it). Already-published versions stay frozen until you publish again.</p>}
            <QuestionEditor
              courseId={a.courseId}
              initial={editing.q}
              units={units}
              topics={topics}
              onCancel={() => setEditing(null)}
              onSaved={async (saved) => {
                const secId = editing.sectionId;
                setEditing(null);
                if (secId) {
                  const sec = detail.sections.find((x) => x.id === secId)!;
                  await setQuestions(secId, [...sec.questions.map((q) => q.id), saved.id]);
                } else router.refresh();
              }}
            />
          </>
        )}
      </Modal>

      <BankPicker
        key={picker?.id ?? "none"}
        section={picker}
        bank={bank}
        units={units}
        onClose={() => setPicker(null)}
        onAdd={async (ids) => {
          if (!picker) return;
          await setQuestions(picker.id, [...picker.questions.map((q) => q.id), ...ids]);
          toast(`Added ${ids.length} question${ids.length === 1 ? "" : "s"}`);
          setPicker(null);
        }}
      />
    </div>
  );
}

function guessType(title: string): QuestionType {
  const t = title.toLowerCase();
  if (t.includes("match")) return "matching";
  if (t.includes("blank")) return "fill_blank";
  if (t.includes("short") || t.includes("written")) return "short_answer";
  return "multiple_choice";
}

function SectionCard({
  s, index, count, passDefault, busy, onMove, onUpdate, onDelete, onSetQuestions, onEdit, onAddFromBank, onNew,
}: {
  s: Sec; index: number; count: number; passDefault: number; busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onSetQuestions: (ids: string[]) => void;
  onEdit: (q: Q) => void;
  onAddFromBank: () => void;
  onNew: () => void;
}) {
  const [title, setTitle] = useState(s.title);
  const [instr, setInstr] = useState(s.instructions);
  const [pass, setPass] = useState(s.settings?.passPercent != null ? String(s.settings.passPercent) : "");
  const [draw, setDraw] = useState(s.settings?.drawCount ? String(s.settings.drawCount) : "");
  const [open, setOpen] = useState(false);
  const ids = s.questions.map((q) => q.id);
  const move = (i: number, dir: -1 | 1) => {
    const n = [...ids];
    const [x] = n.splice(i, 1);
    n.splice(i + dir, 0, x);
    onSetQuestions(n);
  };
  const types = [...new Set(s.questions.map((q) => q.type))];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">{index + 1}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== s.title && onUpdate({ title: title.trim() })}
          className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold text-ink-900 hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:outline-none"
          aria-label="Section title"
        />
        <span className="text-sm text-ink-500">
          {s.questions.length} questions{types.length ? ` · ${types.map((t) => QUESTION_TYPE_LABELS[t]).join(", ")}` : ""} · pass {s.settings?.passPercent ?? passDefault}%
          {s.settings?.drawCount ? ` · ${s.settings.drawCount} drawn per try` : ""}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Done" : "Section options"}</Button>
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move section up">↑</Button>
          <Button size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move section down">↓</Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete section">🗑</Button>
        </div>
      </div>
      {open && (
        <div className="grid gap-3 border-b border-ink-100 px-4 py-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          <div>
            <Label>Instructions for students</Label>
            <Input value={instr} onChange={(e) => setInstr(e.target.value)} />
          </div>
          <div>
            <Label hint="(blank = assignment default)">Pass %</Label>
            <Input type="number" min={0} max={100} value={pass} placeholder={String(passDefault)} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div>
            <Label hint="(blank = all)">Questions per try</Label>
            <Input type="number" min={0} value={draw} placeholder="All" onChange={(e) => setDraw(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => onUpdate({ instructions: instr, settings: { passPercent: pass === "" ? null : Number(pass), drawCount: draw === "" ? null : Number(draw) } })}>Save</Button>
          </div>
          <p className="text-sm text-ink-500 md:col-span-4">“Questions per try” serves a random set from this section each try — great with a bigger pool so retries aren&apos;t identical.</p>
        </div>
      )}
      <ol className={cx("divide-y divide-ink-100", busy && "opacity-60")}>
        {s.questions.map((q, i) => (
          <li key={q.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-400">{i + 1}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(q)}>
              <div className="line-clamp-2 whitespace-pre-line font-medium text-ink-900 hover:text-brand-700">{q.prompt}</div>
              <div className="line-clamp-1 text-sm text-ink-500">{answerSummary(q.data)}</div>
            </button>
            <Badge>{QUESTION_TYPE_LABELS[q.type]}</Badge>
            <div className="flex shrink-0">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
              <Button size="sm" variant="ghost" disabled={i === s.questions.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(q)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => onSetQuestions(ids.filter((x) => x !== q.id))} aria-label="Remove from section" title="Remove from section (stays in bank)">✕</Button>
            </div>
          </li>
        ))}
        {s.questions.length === 0 && <li className="px-4 py-6 text-center text-ink-500">No questions yet.</li>}
      </ol>
      <div className="flex gap-2 border-t border-ink-100 px-4 py-3">
        <Button size="sm" onClick={onAddFromBank}>+ Add from question bank</Button>
        <Button size="sm" variant="secondary" onClick={onNew}>+ Write new question</Button>
      </div>
    </Card>
  );
}

function BankPicker({ section, bank, units, onClose, onAdd }: { section: Sec | null; bank: Q[]; units: { id: string; name: string }[]; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>(section?.questions[0]?.type ?? "");
  const [unit, setUnit] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const inSection = new Set(section?.questions.map((q) => q.id));
  const list = bank.filter(
    (q) => !inSection.has(q.id) && (!type || q.type === type) && (!unit || q.unitId === unit) && (!search || `${q.prompt} ${q.topic} ${JSON.stringify(q.data)}`.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <Modal open={!!section} onClose={onClose} title={`Add questions to “${section?.title ?? ""}”`} wide>
      <div className="mb-3 grid gap-2 md:grid-cols-[2fr_1fr_1fr]">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
        </Select>
        <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      <div className="max-h-[50vh] divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
        {list.length === 0 && <p className="p-6 text-center text-ink-500">No more matching questions in this class&apos;s bank. Use “Write new question” instead.</p>}
        {list.map((q) => (
          <label key={q.id} className={cx("flex cursor-pointer gap-3 px-4 py-3 hover:bg-ink-50", sel.includes(q.id) && "bg-brand-50")}>
            <input type="checkbox" className="mt-1 h-4 w-4" checked={sel.includes(q.id)} onChange={() => setSel((s) => (s.includes(q.id) ? s.filter((x) => x !== q.id) : [...s, q.id]))} />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 whitespace-pre-line font-medium text-ink-900">{q.prompt}</div>
              <div className="line-clamp-1 text-sm text-ink-500">{QUESTION_TYPE_LABELS[q.type]} · {q.topic || "no topic"} · {answerSummary(q.data)}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setSel(list.map((q) => q.id))} disabled={!list.length}>Select all {list.length}</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!sel.length} onClick={() => onAdd(sel)}>Add {sel.length || ""} selected</Button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsForm({ detail, units, periods, aiOn }: { detail: Detail; units: { id: string; name: string }[]; periods: { id: string; name: string }[]; aiOn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const a = detail.assignment;
  const [f, setF] = useState({
    title: a.title, kind: a.kind, directions: a.directions, unitId: a.unitId ?? "",
    opensAt: toLocalInput(a.opensAt), closesAt: toLocalInput(a.closesAt), periodIds: detail.periodIds,
  });
  const [s, setS] = useState<AssignmentSettings>(a.settings);
  const [busy, setBusy] = useState(false);
  const S = <K extends keyof AssignmentSettings>(k: K, v: AssignmentSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/teacher/assignments/${a.id}`, {
        method: "PATCH",
        body: {
          title: f.title, kind: f.kind, directions: f.directions, unitId: f.unitId || null,
          opensAt: f.opensAt ? new Date(f.opensAt).toISOString() : null,
          closesAt: f.closesAt ? new Date(f.closesAt).toISOString() : null,
          periodIds: f.periodIds,
          settings: s,
        },
      });
      toast(a.status === "published" ? "Saved. Rule changes reach students when you publish changes." : "Saved");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-bold">Basics</h2>
        <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="review">Review</option><option value="quiz">Quiz</option><option value="practice">Practice</option><option value="test">Test</option></Select></div>
          <div><Label>Unit</Label><Select value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}><option value="">No unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></div>
        </div>
        <div><Label hint="(shown on the student start screen)">Directions</Label><Textarea rows={4} value={f.directions} onChange={(e) => setF({ ...f, directions: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label hint="(optional)">Opens</Label><Input type="datetime-local" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} /></div>
          <div><Label hint="(optional)">Closes</Label><Input type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></div>
        </div>
        <div>
          <Label>Assigned class periods</Label>
          {periods.length === 0 ? <p className="text-sm text-ink-500">This class has no periods — students won&apos;t be asked for one. Add periods under the class&apos;s “Periods, units & settings” tab.</p> : (
            <div className="flex flex-wrap gap-2">
              {periods.map((p) => {
                const on = f.periodIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => setF({ ...f, periodIds: on ? f.periodIds.filter((x) => x !== p.id) : [...f.periodIds, p.id] })} className={cx("rounded-xl border-2 px-3 py-1.5 text-sm font-semibold", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-500")} aria-pressed={on}>
                    {on ? "✓ " : ""}{p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-lg font-bold">Progression & retries</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label hint="(to unlock the next section)">Passing score %</Label>
            <Input type="number" min={0} max={100} value={s.passPercent} onChange={(e) => S("passPercent", Number(e.target.value))} />
            <p className="mt-1 text-xs text-ink-500">Passing unlocks the next section. It is not the grade.</p>
          </div>
          <div>
            <Label hint="(0 = unlimited)">Graded tries per section</Label>
            <Input type="number" min={0} max={50} value={s.maxGradedRuns} onChange={(e) => S("maxGradedRuns", Number(e.target.value))} />
          </div>
        </div>
        <Toggle checked={s.sequential} onChange={(v) => S("sequential", v)} label="Sections must be done in order" description="Off = students can open any section freely." />
        <Toggle checked={s.allowPracticeAfterLimit} onChange={(v) => S("allowPracticeAfterLimit", v)} disabled={s.maxGradedRuns === 0} label="Allow practice tries after graded tries are used" description="Practice tries can unlock the next section but never change the grade." />
        <div>
          <Label>Grade each section using the</Label>
          <Select value={s.gradeBasis} onChange={(e) => S("gradeBasis", e.target.value as AssignmentSettings["gradeBasis"])}>
            <option value="best">Best graded try</option>
            <option value="latest">Latest graded try</option>
            <option value="first">First try</option>
          </Select>
          <p className="mt-1 text-xs text-ink-500">You can always override any student&apos;s final grade on the results page.</p>
        </div>
        <div>
          <Label>Short answers the auto-grader is unsure about</Label>
          <Select value={s.shortAnswerProgression} onChange={(e) => S("shortAnswerProgression", e.target.value as AssignmentSettings["shortAnswerProgression"])}>
            <option value="provisional">Let students continue; I&apos;ll review (recommended)</option>
            <option value="strict">Students must reach the passing score on the automatic score</option>
          </Select>
          <p className="mt-1 text-xs text-ink-500">{aiOn ? "AI grading is ON (server-side). Scores are suggestions until you approve them." : "AI grading is off — short answers use your rubric and are marked provisional."}</p>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-lg font-bold">Feedback</h2>
        <Toggle checked={s.showScores} onChange={(v) => S("showScores", v)} label="Show students their scores and which answers were right" description="Turn off for tests: students only see “submitted”." />
        <Toggle checked={s.showExplanations} onChange={(v) => S("showExplanations", v)} disabled={!s.showScores} label="Show explanations" />
        <div>
          <Label>Explanations appear</Label>
          <Select value={s.feedbackTiming} onChange={(e) => S("feedbackTiming", e.target.value as AssignmentSettings["feedbackTiming"])}>
            <option value="after_section">After submitting the whole section</option>
            <option value="per_question">Immediately — students check each question (locks that answer)</option>
          </Select>
        </div>
        <div>
          <Label>Show the correct answers</Label>
          <Select value={s.showCorrectAnswers} onChange={(e) => S("showCorrectAnswers", e.target.value as AssignmentSettings["showCorrectAnswers"])}>
            <option value="after_pass">Only after the student passes the section</option>
            <option value="after_close">Only after the assignment closes</option>
            <option value="always">Right after each submission</option>
            <option value="never">Never</option>
          </Select>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-lg font-bold">Scoring & order</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total points</Label><Input type="number" min={1} value={s.totalPoints} onChange={(e) => S("totalPoints", Number(e.target.value))} /></div>
          <div>
            <Label>Section weight</Label>
            <Select value={s.sectionWeighting} onChange={(e) => S("sectionWeighting", e.target.value as AssignmentSettings["sectionWeighting"])}>
              <option value="equal">Equal (e.g. 4 × 25)</option>
              <option value="points">By question points</option>
            </Select>
          </div>
        </div>
        <Toggle checked={s.shuffleQuestions} onChange={(v) => S("shuffleQuestions", v)} label="Shuffle question order" />
        <Toggle checked={s.shuffleChoices} onChange={(v) => S("shuffleChoices", v)} label="Shuffle multiple-choice answers" />
      </Card>

      <div className="flex justify-end gap-2 lg:col-span-2">
        <Button size="lg" onClick={save} loading={busy}>Save settings</Button>
      </div>
    </div>
  );
}

function SharePanel({ detail, courses, onPublish, publishing }: { detail: Detail; courses: { id: string; name: string }[]; onPublish: () => void; publishing: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const a = detail.assignment;
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [copyTarget, setCopyTarget] = useState(a.courseId);
  const link = `${origin}/join/${a.joinCode}`;
  const act = async (action: string, msg: string, extra: Record<string, unknown> = {}) => {
    try {
      const r = await api<{ id?: string }>(`/api/teacher/assignments/${a.id}/actions`, { body: { action, ...extra } });
      toast(msg);
      if (action === "duplicate" && r?.id) router.push(`/teacher/assignments/${r.id}`);
      else router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const live = a.status === "published";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-bold">Student access</h2>
        {live ? (
          <>
            <p className="mt-1 text-ink-600">Students go to <b>{origin || "your site"}</b> and type the code, or open the link.</p>
            <div className="mt-4 rounded-2xl bg-ink-900 py-6 text-center font-mono text-5xl font-black tracking-[0.25em] text-white">{a.joinCode}</div>
            <div className="mt-4 flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} />
              <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(link); toast("Link copied"); }}>Copy link</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/join/${a.joinCode}`} target="_blank" rel="noreferrer"><Button variant="secondary">Open student page ↗</Button></a>
              <Button variant="secondary" onClick={async () => { if (await confirm({ title: "Close assignment?", message: "Students can no longer start or submit work. Everything they've done is kept, and you can re-open it any time.", confirmLabel: "Close it" })) void act("close", "Assignment closed"); }}>Close / unpublish</Button>
              <Button variant="ghost" onClick={async () => { if (await confirm({ title: "Make a new join code?", message: "The old code and link will stop working. Students who already started can keep going.", confirmLabel: "New code" })) void act("regenerate_code", "New code created"); }}>New code</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-ink-600">{a.status === "closed" ? "This assignment is closed. Students can see their results but can't work on it." : "This assignment is a draft. Students can't see it yet."}</p>
            <Button className="mt-4" variant="success" size="lg" onClick={onPublish} loading={publishing}>{a.status === "closed" ? "Re-open & publish" : "Publish now"}</Button>
          </>
        )}
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-bold">Reuse</h2>
        <p className="text-ink-600">Duplicate makes a new draft with a new code. Student results are never copied.</p>
        <div className="flex gap-2">
          <Select value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === a.courseId ? " (this class)" : ""}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => act("duplicate", "Duplicated", { targetCourseId: copyTarget })}>Duplicate</Button>
        </div>
        <div>
          <h3 className="font-semibold">Published versions</h3>
          {detail.versions.length === 0 ? <p className="text-sm text-ink-500">Not published yet.</p> : (
            <ul className="mt-1 text-sm text-ink-600">
              {detail.versions.map((v) => <li key={v.id}>Version {v.versionNumber} — <LocalTime value={v.publishedAt} />{v.id === a.currentVersionId ? " (current)" : ""}</li>)}
            </ul>
          )}
          <p className="mt-1 text-xs text-ink-500">Each student is graded against the version they started, so edits never silently change past grades.</p>
        </div>
      </Card>
      <Card className="space-y-3 border-rose-200 p-6 lg:col-span-2">
        <h2 className="text-lg font-bold text-rose-800">Danger zone</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => act(a.archivedAt ? "unarchive" : "archive", a.archivedAt ? "Restored" : "Archived")}>{a.archivedAt ? "Unarchive" : "Archive (keeps results)"}</Button>
          <Button variant="danger" onClick={async () => { if (await confirm({ title: "Delete ALL student results for this assignment?", message: "Every student's work and grades for this assignment will be permanently deleted. Export a CSV first if you need them.", danger: true, confirmLabel: "Delete results", typeToConfirm: "DELETE" })) void act("delete_results", "Student results deleted"); }}>Delete all student results</Button>
          <Button variant="danger" onClick={async () => {
            if (await confirm({ title: "Delete this assignment?", message: "The assignment, its versions and ALL student results will be permanently deleted. Questions stay in your question bank.", danger: true, confirmLabel: "Delete assignment", typeToConfirm: "DELETE" })) {
              try { await api(`/api/teacher/assignments/${a.id}`, { method: "DELETE" }); toast("Assignment deleted"); router.push(`/teacher/classes/${a.courseId}`); } catch (e) { toast((e as Error).message, "error"); }
            }
          }}>Delete assignment</Button>
        </div>
      </Card>
    </div>
  );
}
