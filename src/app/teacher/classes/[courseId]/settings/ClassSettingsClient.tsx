"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, Input, Label, Textarea, Toggle, cx, useConfirm, useToast } from "@/components/ui";
import { COURSE_COLORS, colorDot } from "@/components/teacher/colors";

interface Item { id: string; name: string; archived: boolean }

function ItemList({ kind, items, courseId }: { kind: "periods" | "units"; items: Item[]; courseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const label = kind === "periods" ? "period" : "unit";
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const a = items[i], b = items[i + dir];
    void run(async () => {
      await api(`/api/teacher/${kind}/${a.id}`, { method: "PATCH", body: { sortOrder: i + dir } });
      await api(`/api/teacher/${kind}/${b.id}`, { method: "PATCH", body: { sortOrder: i } });
    }, "Reordered");
  };
  return (
    <div>
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
        {items.length === 0 && <li className="px-3 py-3 text-ink-500">None yet.</li>}
        {items.map((it, i) => (
          <li key={it.id} className={cx("flex items-center gap-2 px-3 py-2", it.archived && "bg-ink-50")}>
            <Input
              value={edit[it.id] ?? it.name}
              onChange={(e) => setEdit({ ...edit, [it.id]: e.target.value })}
              onBlur={() => edit[it.id] != null && edit[it.id].trim() && edit[it.id] !== it.name && run(() => api(`/api/teacher/${kind}/${it.id}`, { method: "PATCH", body: { name: edit[it.id].trim() } }), "Renamed")}
              className={cx("h-9", it.archived && "text-ink-400")}
              aria-label={`Rename ${label}`}
            />
            <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
            <Button size="sm" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/teacher/${kind}/${it.id}`, { method: "PATCH", body: { archived: !it.archived } }), it.archived ? "Restored" : "Archived")}>
              {it.archived ? "Restore" : "Archive"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (await confirm({ title: `Delete ${label} “${it.name}”?`, message: kind === "periods" ? "Student work is kept, but those students will show “—” as their period. Archiving is usually better." : "Assignments and questions in this unit are kept (they move to “No unit”).", danger: true, confirmLabel: "Delete" }))
                  void run(() => api(`/api/teacher/${kind}/${it.id}`, { method: "DELETE" }), "Deleted");
              }}
              aria-label="Delete"
            >
              🗑
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(() => api(`/api/teacher/courses/${courseId}/${kind}`, { body: { name: name.trim() } }), "Added").then(() => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "periods" ? "e.g. 5th Period" : "e.g. Unit 4: Personal Finance"} />
        <Button type="submit" variant="secondary">Add {label}</Button>
      </form>
    </div>
  );
}

export function ClassSettingsClient({ course, periods, units }: { course: { id: string; name: string; description: string; color: string; archived: boolean }; periods: Item[]; units: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ name: course.name, description: course.description, color: course.color });
  const [dup, setDup] = useState({ name: `${course.name} (${new Date().getFullYear() + 1})`, copyPeriods: false });
  const [busy, setBusy] = useState("");

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/teacher/courses/${course.id}`, { method: "PATCH", body });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-bold">Class details</h2>
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Description</Label><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div>
          <Label>Color</Label>
          <div className="flex gap-2">
            {COURSE_COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c} className={cx("h-8 w-8 rounded-full ring-offset-2", colorDot(c), f.color === c && "ring-2 ring-ink-800")} />)}
          </div>
        </div>
        <Button onClick={() => patch(f, "Saved")}>Save</Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Class periods</h2>
        <p className="text-sm text-ink-500">Students pick their period when they join. Results and exports can be filtered by period. Archive periods you no longer teach — their past results stay.</p>
        <ItemList kind="periods" items={periods} courseId={course.id} />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Units / topics</h2>
        <p className="text-sm text-ink-500">Group assignments and questions by unit.</p>
        <ItemList kind="units" items={units} courseId={course.id} />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">New school year?</h2>
        <p className="text-sm text-ink-500">Copy this class&apos;s units, question bank and assignments into a fresh class. Assignments come over as unpublished drafts with new codes. <b>No student data is copied.</b></p>
        <div><Label>New class name</Label><Input value={dup.name} onChange={(e) => setDup({ ...dup, name: e.target.value })} /></div>
        <Toggle checked={dup.copyPeriods} onChange={(v) => setDup({ ...dup, copyPeriods: v })} label="Copy period names too" />
        <Button
          variant="secondary"
          loading={busy === "dup"}
          onClick={async () => {
            setBusy("dup");
            try {
              const c = await api<{ id: string }>(`/api/teacher/courses/${course.id}/duplicate`, { body: dup });
              toast("Class copied");
              router.push(`/teacher/classes/${c.id}`);
              router.refresh();
            } catch (e) {
              toast((e as Error).message, "error");
            } finally {
              setBusy("");
            }
          }}
        >
          Duplicate class
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Backup</h2>
        <p className="text-sm text-ink-500">Download everything in this class as a file you can keep (questions, assignments, versions, and optionally student work).</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/teacher/courses/${course.id}/backup`}><Button variant="secondary">Download backup (no student data)</Button></a>
          <a href={`/api/teacher/courses/${course.id}/backup?work=1`}><Button variant="secondary">Download with student work</Button></a>
        </div>
      </Card>

      <Card className="space-y-3 border-rose-200 p-5">
        <h2 className="text-lg font-bold text-rose-800">Archive or delete</h2>
        <p className="text-sm text-ink-500">Archiving hides the class from your menu but keeps everything. Deleting removes the class, its question bank, assignments and all student work permanently.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => patch({ archived: !course.archived }, course.archived ? "Class restored" : "Class archived")}>{course.archived ? "Unarchive class" : "Archive class"}</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (await confirm({ title: `Delete “${course.name}” forever?`, message: "This permanently deletes the class, every question, every assignment and ALL student results in it. Download a backup first if you might need anything.", danger: true, confirmLabel: "Delete class", typeToConfirm: "DELETE" })) {
                try {
                  await api(`/api/teacher/courses/${course.id}`, { method: "DELETE" });
                  toast("Class deleted");
                  router.push("/teacher/classes");
                  router.refresh();
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }
            }}
          >
            Delete class
          </Button>
        </div>
      </Card>
    </div>
  );
}
