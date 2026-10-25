"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function ClassTabs({ courseId }: { courseId: string }) {
  const path = usePathname();
  const base = `/teacher/classes/${courseId}`;
  const tabs = [
    { href: base, label: "Assignments", exact: true },
    { href: `${base}/questions`, label: "Question bank" },
    { href: `${base}/gradebook`, label: "Gradebook" },
    { href: `${base}/settings`, label: "Periods, units & settings" },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[15px] font-semibold transition", active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
