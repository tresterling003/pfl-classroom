"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Input, Label, Toggle } from "@/components/ui";

export function SetupForm({ needCode }: { needCode: boolean }) {
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", setupCode: "" });
  const [starter, setStarter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (f.password !== f.confirm) return setError("The passwords don't match.");
        setBusy(true);
        try {
          await api("/api/auth/setup", { body: { name: f.name, email: f.email, password: f.password, setupCode: needCode ? f.setupCode : undefined, starterContent: starter } });
          window.location.href = "/teacher";
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {needCode && (
        <div>
          <Label htmlFor="code">Setup code</Label>
          <Input id="code" value={f.setupCode} onChange={set("setupCode")} required autoComplete="off" />
        </div>
      )}
      <div>
        <Label htmlFor="name" hint="(shown only to you)">
          Your name
        </Label>
        <Input id="name" value={f.name} onChange={set("name")} required placeholder="Mr. Sterling" />
      </div>
      <div>
        <Label htmlFor="email">Email (used to sign in)</Label>
        <Input id="email" type="email" value={f.email} onChange={set("email")} required autoComplete="username" />
      </div>
      <div>
        <Label htmlFor="pw" hint="(10+ characters, letters and a number)">
          Password
        </Label>
        <Input id="pw" type="password" value={f.password} onChange={set("password")} required autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor="pw2">Confirm password</Label>
        <Input id="pw2" type="password" value={f.confirm} onChange={set("confirm")} required autoComplete="new-password" />
      </div>
      <Toggle checked={starter} onChange={setStarter} label="Add starter content" description="Creates your PFL / Economics class with the 40-question Unit Review (unpublished), plus two empty example classes." />
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Create account
      </Button>
    </form>
  );
}
