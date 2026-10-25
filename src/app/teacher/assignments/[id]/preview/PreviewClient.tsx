"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Player } from "@/components/player/Player";
import { Spinner } from "@/components/ui";

export function PreviewClient({ assignmentId }: { assignmentId: string }) {
  const base = `/api/teacher/assignments/${assignmentId}/preview`;
  const [gen, setGen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const start = useCallback(async () => {
    try {
      await api(base, { body: { action: "reset" } });
      setGen((g) => g + 1);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [base]);
  const reset = useCallback(() => {
    setReady(false);
    setError(null);
    void start();
  }, [start]);
  useEffect(() => {
    // fetch on mount; state is only set after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
  }, [start]);
  return (
    <div className="-mx-4 -mt-6 sm:-mx-8">
      <div className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-2 text-sm">
        <Link href={`/teacher/assignments/${assignmentId}`} className="font-semibold text-brand-700 hover:underline">← Back to editor</Link>
        <span className="text-ink-500">Previewing your current draft (including unpublished edits).</span>
      </div>
      {error && <p className="m-6 rounded-xl bg-rose-50 p-4 font-medium text-rose-800">{error}</p>}
      {!ready && !error && <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>}
      {ready && <Player key={gen} apiBase={base} preview onReset={reset} />}
    </div>
  );
}
