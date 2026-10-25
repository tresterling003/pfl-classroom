"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Input, Label } from "@/components/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { email, password } });
          window.location.href = "/teacher";
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <div>
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Sign in
      </Button>
      <p className="text-center text-xs text-ink-500">Forgot your password? See “Reset a forgotten password” in the setup guide.</p>
    </form>
  );
}
