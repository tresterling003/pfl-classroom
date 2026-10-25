"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, Input, Label, useConfirm, useToast } from "@/components/ui";
import { PageHeader } from "@/components/teacher/PageHeader";

export function SettingsClient({ name, email, ai, db }: { name: string; email: string; ai: { on: boolean; model: string | null }; db: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [n, setN] = useState(name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [before, setBefore] = useState("");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings & privacy" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">Your account</h2>
          <div className="text-sm text-ink-500">Signed in as <b>{email}</b></div>
          <div><Label>Display name</Label><Input value={n} onChange={(e) => setN(e.target.value)} /></div>
          <Button variant="secondary" onClick={async () => { try { await api("/api/auth/password", { body: { current: "", next: "", name: n } }); toast("Name saved"); } catch (e) { toast((e as Error).message, "error"); } }}>Save name</Button>
          <hr className="border-ink-100" />
          <h3 className="font-semibold">Change password</h3>
          <div><Label>Current password</Label><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div><Label hint="(10+ characters with a letter and a number)">New password</Label><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
          <div><Label>Confirm new password</Label><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
          <Button
            onClick={async () => {
              if (pw.next !== pw.confirm) return toast("New passwords don't match", "error");
              try {
                await api("/api/auth/password", { body: { current: pw.current, next: pw.next } });
                toast("Password changed — please sign in again");
                setTimeout(() => (window.location.href = "/login"), 1200);
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Change password
          </Button>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-2 p-5">
            <h2 className="text-lg font-bold">Short-answer grading</h2>
            {ai.on ? (
              <p className="text-[15px] text-ink-700"><Badge tone="green">AI grading on</Badge> using <code>{ai.model}</code>. Runs on the server only; students never see the key. AI scores are suggestions you can approve or change.</p>
            ) : (
              <p className="text-[15px] text-ink-700"><Badge>Rubric grading</Badge> Short answers are scored with your rubric phrases and marked provisional for your review. To turn on AI grading, add <code>AI_PROVIDER=anthropic</code> and <code>ANTHROPIC_API_KEY</code> in your hosting environment settings (see the setup guide — this costs money per answer).</p>
            )}
          </Card>
          <Card className="space-y-2 p-5">
            <h2 className="text-lg font-bold">Privacy</h2>
            <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink-700">
              <li>Students give only a name and class period. No email, login or tracking.</li>
              <li>Each student&apos;s browser gets a secret, private session; another student can&apos;t open their work, even with the same name.</li>
              <li>Only you can see results. Pages are hidden from search engines.</li>
              <li>Database: {db === "cloud" ? "your cloud Postgres database" : "local database on this computer (development)"}.</li>
            </ul>
          </Card>
          <Card className="space-y-3 border-rose-200 p-5">
            <h2 className="text-lg font-bold text-rose-800">Data retention</h2>
            <p className="text-sm text-ink-600">Permanently delete student work started before a date, across all your classes (e.g. at the end of the school year, after grades are final). Questions and assignments are kept.</p>
            <div className="flex gap-2">
              <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} aria-label="Delete before date" />
              <Button
                variant="danger"
                disabled={!before}
                onClick={async () => {
                  if (!(await confirm({ title: "Delete old student work?", message: `All student submissions started before ${before} will be permanently deleted. Export your grades first.`, danger: true, confirmLabel: "Delete", typeToConfirm: "DELETE" }))) return;
                  try {
                    const r = await api<{ count: number }>("/api/teacher/retention", { body: { before: new Date(before + "T00:00:00").toISOString() } });
                    toast(`Deleted ${r.count} submissions`);
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
