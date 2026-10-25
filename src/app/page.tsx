import Link from "next/link";
import { CodeEntry } from "./CodeEntry";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-grid">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink-900">
          <Logo /> PFL Classroom
        </div>
        <Link href="/teacher" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-white/70">
          Teacher sign in
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-24">
        <div className="w-full max-w-md animate-pop rounded-3xl border border-ink-200 bg-white p-8 shadow-xl shadow-brand-900/5">
          <h1 className="text-center text-3xl font-extrabold text-ink-900">Join your class activity</h1>
          <p className="mt-2 text-center text-ink-600">Type the code your teacher gave you.</p>
          <CodeEntry />
        </div>
      </div>
    </main>
  );
}
