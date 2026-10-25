"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, EmptyState, Input, Label, Modal, Textarea, cx, useToast } from "@/components/ui";
import { PageHeader } from "@/components/teacher/PageHeader";
import { COURSE_COLORS, colorBand, colorDot } from "@/components/teacher/colors";

interface C { id: string; name: string; description: string; color: string; archived: boolean; assignments: number; questions: number; periods: number }

export function ClassesClient({ courses, startOpen }: { courses: C[]; startOpen: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(startOpen);
  const [showArchived, setShowArchived] = useState(false);
  const [f, setF] = useState({ name: "", description: "", color: "indigo", periods: "1st Period, 2nd Period, 3rd Period" });
  const [busy, setBusy] = useState(false);
  const list = courses.filter((c) => c.archived === showArchived);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api<{ id: string }>("/api/teacher/courses", {
        body: { name: f.name, description: f.description, color: f.color, periods: f.periods.split(",").map((p) => p.trim()).filter(Boolean) },
      });
      router.push(`/teacher/classes/${c.id}`);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Classes"
        sub="Each class has its own question bank, assignments, periods and gradebook."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Show active" : `Archived (${courses.filter((c) => c.archived).length})`}
            </Button>
            <Button onClick={() => setOpen(true)}>+ New class</Button>
          </>
        }
      />
      {list.length === 0 ? (
        <EmptyState title={showArchived ? "No archived classes" : "No classes yet"} action={!showArchived && <Button onClick={() => setOpen(true)}>Create your first class</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <div className={cx("h-2 bg-gradient-to-r", colorBand(c.color))} />
                <div className="p-5">
                  <h2 className="text-lg font-bold text-ink-900 group-hover:text-brand-700">{c.name}</h2>
                  {c.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{c.description}</p>}
                  <div className="mt-4 flex gap-4 text-sm text-ink-600">
                    <span><b className="text-ink-900">{c.assignments}</b> assignments</span>
                    <span><b className="text-ink-900">{c.questions}</b> questions</span>
                    <span><b className="text-ink-900">{c.periods}</b> periods</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New class">
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="cname">Class name</Label>
            <Input id="cname" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Principles of A/V Technology" required autoFocus />
          </div>
          <div>
            <Label htmlFor="cdesc" hint="(optional)">Description</Label>
            <Textarea id="cdesc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cper" hint="(comma separated — you can change these later)">Class periods</Label>
            <Input id="cper" value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value })} />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2">
              {COURSE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c} className={cx("h-8 w-8 rounded-full ring-offset-2 transition", colorDot(c), f.color === c && "ring-2 ring-ink-800")} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create class</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
