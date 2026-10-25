"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) router.push(`/join/${clean}`);
      }}
    >
      <label htmlFor="code" className="sr-only">
        Assignment code
      </label>
      <input
        id="code"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABC123"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        className="h-16 w-full rounded-2xl border-2 border-ink-200 bg-ink-50 text-center font-mono text-3xl font-bold uppercase tracking-[0.3em] text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
      <Button type="submit" size="xl" className="mt-4 w-full" disabled={clean.length < 4}>
        Continue
      </Button>
    </form>
  );
}
