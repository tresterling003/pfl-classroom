import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { href: string; label: string }[]; actions?: ReactNode }) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-300">/</span>}
              <Link href={c.href} className="hover:text-ink-800 hover:underline">
                {c.label}
              </Link>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight text-ink-900 sm:text-[28px]">{title}</h1>
          {sub && <div className="mt-1 text-ink-600">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status, archived, changes }: { status: string; archived?: boolean; changes?: boolean }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (archived) return <span className={`${base} bg-ink-100 text-ink-600`}>Archived</span>;
  if (status === "published")
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live{changes ? " · edits not published" : ""}
      </span>
    );
  if (status === "closed") return <span className={`${base} bg-amber-100 text-amber-800`}>Closed</span>;
  return <span className={`${base} bg-ink-100 text-ink-700`}>Draft</span>;
}
