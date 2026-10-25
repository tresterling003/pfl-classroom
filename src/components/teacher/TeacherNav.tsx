"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { colorDot } from "./colors";

export function TeacherNav({ teacherName, courses }: { teacherName: string; courses: { id: string; name: string; color: string }[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const item = (href: string, label: string, exact = false) => {
    const active = exact ? path === href : path.startsWith(href);
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-[15px] font-medium transition", active ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-100")}
      >
        {label}
      </Link>
    );
  };
  return (
    <>
      <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/teacher" className="flex items-center gap-2 font-extrabold text-ink-900">
          <Logo /> PFL Classroom
        </Link>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold" aria-expanded={open}>
          Menu
        </button>
      </div>
      <aside className={cx("shrink-0 border-r border-ink-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64", open ? "block" : "hidden")}>
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <Link href="/teacher" className="mb-6 hidden items-center gap-2 px-2 text-lg font-extrabold tracking-tight text-ink-900 lg:flex">
            <Logo /> PFL Classroom
          </Link>
          <nav className="space-y-1">
            {item("/teacher", "Dashboard", true)}
            {item("/teacher/review", "Needs review")}
            {item("/teacher/classes", "All classes", true)}
          </nav>
          <div className="mb-1 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-ink-400">My classes</div>
          <nav className="space-y-0.5">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/teacher/classes/${c.id}`}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[15px] transition",
                  path.startsWith(`/teacher/classes/${c.id}`) ? "bg-ink-100 font-semibold text-ink-900" : "text-ink-700 hover:bg-ink-50",
                )}
              >
                <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", colorDot(c.color))} />
                <span className="truncate">{c.name}</span>
              </Link>
            ))}
            <Link href="/teacher/classes?new=1" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[15px] text-brand-700 hover:bg-brand-50">
              + New class
            </Link>
          </nav>
          <div className="mt-auto space-y-1 border-t border-ink-100 pt-4">
            {item("/teacher/settings", "Settings & privacy")}
            <a href="/" target="_blank" className="flex rounded-xl px-3 py-2 text-[15px] text-ink-700 hover:bg-ink-100">
              Student join page ↗
            </a>
            <div className="flex items-center justify-between px-3 pt-2 text-sm text-ink-500">
              <span className="truncate">{teacherName}</span>
              <button
                className="font-semibold text-ink-600 hover:text-ink-900"
                onClick={async () => {
                  await api("/api/auth/logout", { body: {} });
                  window.location.href = "/login";
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
