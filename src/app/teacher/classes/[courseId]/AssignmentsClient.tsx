"use client";
import { LocalTime } from "@/components/LocalTime";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, useConfirm, useToast } from "@/components/ui";
import { StatusBadge } from "@/components/teacher/PageHeader";

interface A {
  id: string; title: string; kind: string; status: string; joinCode: string; unitId: string | null; closesAt: string | null;
  archived: boolean; hasUnpublishedChanges: boolean; started: number; completed: number;
}
const KIND_LABEL: Record<string, string> = { review: "Review", quiz: "Quiz", practice: "Practice", test: "Test" };
const KIND_TONE: Record<string, "brand" | "sky" | "green" | "violet"> = { review: "brand", quiz: "sky", practice: "green", test: "violet" };

export function AssignmentsClient({ courseId, assignments, units, courses, archived }: { courseId: string; assignments: A[]; units: { id: string; name: string }[]; courses: { id: string; name: string }[]; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [copyFor, setCopyFor] = useState<A | null>(null);
  const [target, setTarget] = useState(courseId);
  const [f, setF] = useState({ title: "", kind: "review", unitId: "", template: "four_sections" });
  const [busy, setBusy] = useState(false);

  const groups = [...units.map((u) => ({ id: u.id, name: u.name })), { id: "", name: "No unit" }]
    .map((u) => ({ ...u, items: assignments.filter((a) => (a.unitId ?? "") === u.id) }))
    .filter((g) => g.items.length);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await api<{ id: string }>(`/api/teacher/courses/${courseId}/assignments`, { body: { ...f, unitId: f.unitId || null } });
      router.push(`/teacher/assignments/${a.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  };

  const action = async (a: A, act: string) => {
    if (act === "archive") {
      const ok = await confirm({ title: "Archive assignment?", message: "Students won't be able to open it. All submissions and grades are kept — you can unarchive any time.", confirmLabel: "Archive" });
      if (!ok) return;
    }
    try {
      await api(`/api/teacher/assignments/${a.id}/actions`, { body: { action: act } });
      toast(act === "archive" ? "Archived" : act === "unarchive" ? "Restored" : "Done");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const duplicate = async () => {
    if (!copyFor) return;
    setBusy(true);
    try {
      const a = await api<{ id: string }>(`/api/teacher/assignments/${copyFor.id}/actions`, { body: { action: "duplicate", targetCourseId: target } });
      toast("Copied as a new draft (no student results were copied).");
      setCopyFor(null);
      router.push(`/teacher/assignments/${a.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-ink-600">
          {archived ? "Archived assignments — results are kept." : `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`}
        </div>
        <div className="flex gap-2">
          <Link href={archived ? `/teacher/classes/${courseId}` : `/teacher/classes/${courseId}?archived=1`}>
            <Button variant="secondary">{archived ? "← Active assignments" : "Archived"}</Button>
          </Link>
          {!archived && <Button onClick={() => setCreating(true)}>+ New assignment</Button>}
        </div>
      </div>

      {groups.length === 0 && (
        <EmptyState title={archived ? "Nothing archived" : "No assignments yet"} action={!archived && <Button onClick={() => setCreating(true)}>Create an assignment</Button>}>
          {!archived && "Build a review, quiz, practice set or test from your question bank."}
        </EmptyState>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.id || "none"}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">{g.name}</h2>
            <Card className="divide-y divide-ink-100">
              {g.items.map((a) => (
                <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/teacher/assignments/${a.id}`} className="text-[17px] font-bold text-ink-900 hover:text-brand-700">
                        {a.title}
                      </Link>
                      <Badge tone={KIND_TONE[a.kind] ?? "gray"}>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                      <StatusBadge status={a.status} archived={a.archived} changes={a.hasUnpublishedChanges} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-500">
                      {a.status !== "draft" && (
                        <span>
                          Code <b className="font-mono tracking-wider text-ink-800">{a.joinCode}</b>
                        </span>
                      )}
                      <span>
                        {a.completed} completed · {a.started - a.completed} in progress
                      </span>
                      {a.closesAt && <span>Closes <LocalTime value={a.closesAt} /></span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/teacher/assignments/${a.id}/results`}>
                      <Button variant="secondary" size="sm">Results</Button>
                    </Link>
                    <Link href={`/teacher/assignments/${a.id}`}>
                      <Button variant="secondary" size="sm">Edit</Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => { setTarget(courseId); setCopyFor(a); }}>
                      Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => action(a, a.archived ? "unarchive" : "archive")}>
                      {a.archived ? "Unarchive" : "Archive"}
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New assignment">
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="atitle">Title</Label>
            <Input id="atitle" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Scarcity & Opportunity Cost Review" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="akind">Type</Label>
              <Select id="akind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="review">Review (pass sections to unlock)</option>
                <option value="quiz">Quiz (one graded try)</option>
                <option value="practice">Practice (instant feedback)</option>
                <option value="test">Test (no feedback)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="aunit">Unit</Label>
              <Select id="aunit" value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}>
                <option value="">No unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="atpl">Start with</Label>
            <Select id="atpl" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
              <option value="four_sections">4 sections: Matching, Fill in the Blank, Multiple Choice, Short Answer</option>
              <option value="blank">One empty section</option>
            </Select>
          </div>
          <p className="text-sm text-ink-500">Every setting (passing score, retries, feedback) can be changed on the next screen.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!copyFor} onClose={() => setCopyFor(null)} title="Duplicate assignment">
        <div className="space-y-4">
          <p className="text-ink-700">
            Makes a new <b>unpublished draft</b> of “{copyFor?.title}” with its own join code. Student submissions are never copied — perfect for next year or another class.
          </p>
          <div>
            <Label htmlFor="tgt">Copy into class</Label>
            <Select id="tgt" value={target} onChange={(e) => setTarget(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.id === courseId ? " (this class)" : ""}</option>
              ))}
            </Select>
            {target !== courseId && <p className="mt-1 text-sm text-ink-500">The questions it uses will be copied into that class&apos;s question bank.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCopyFor(null)}>Cancel</Button>
            <Button onClick={duplicate} loading={busy}>Duplicate</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
