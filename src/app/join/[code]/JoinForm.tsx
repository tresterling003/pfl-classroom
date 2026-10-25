"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Input, Label, Select } from "@/components/ui";

export function JoinForm({ code, periods, open }: { code: string; periods: { id: string; name: string }[]; open: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [periodId, setPeriodId] = useState(periods.length === 1 ? periods[0].id : "");
  const [resume, setResume] = useState("");
  const [needResume, setNeedResume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please type your first name and last initial.");
    if (periods.length && !periodId) return setError("Please choose your class period.");
    setBusy(true);
    try {
      await api("/api/join", { body: { code, name, periodId: periodId || null, resumeCode: needResume ? resume : undefined } });
      router.replace(`/play/${code}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NAME_TAKEN") setNeedResume(true);
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <Label htmlFor="name" hint="(first name + last initial)">
          Your name
        </Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria G." autoComplete="off" maxLength={60} className="h-12 text-lg" autoFocus />
      </div>
      {periods.length > 0 && (
        <div>
          <Label htmlFor="period">Class period</Label>
          <Select id="period" value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-12 text-lg">
            <option value="">Choose your period…</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {needResume && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <Label htmlFor="resume">Resume code</Label>
          <Input id="resume" value={resume} onChange={(e) => setResume(e.target.value)} placeholder="6 letters/numbers" className="h-12 font-mono text-lg uppercase tracking-widest" autoComplete="off" />
          <p className="mt-2 text-sm text-ink-600">You saw this code on your screen after you started (“Switching devices?”). Your teacher can also look it up for you.</p>
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 font-medium text-rose-800" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" loading={busy} disabled={!open && !needResume}>
        {needResume ? "Continue my work" : "Start"}
      </Button>
      <p className="text-center text-xs text-ink-500">Only your teacher can see your answers and scores.</p>
    </form>
  );
}
