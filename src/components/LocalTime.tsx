"use client";

import { useSyncExternalStore } from "react";
import { fmtDate, fmtDateTime, relative } from "@/lib/format";

const subscribe = () => () => {};

/**
 * Shows a date in the VIEWER's time zone. Servers run on UTC, so the date is only
 * formatted once the page is running in the browser.
 */
export function LocalTime({ value, mode = "datetime", fallback = "—" }: { value: Date | string | null | undefined; mode?: "datetime" | "date" | "relative"; fallback?: string }) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  if (!value) return <>{fallback}</>;
  const iso = new Date(value).toISOString();
  const text = !inBrowser ? "" : mode === "date" ? fmtDate(value) : mode === "relative" ? relative(value) : fmtDateTime(value);
  return (
    <time dateTime={iso} title={inBrowser && mode === "relative" ? fmtDateTime(value) : undefined}>
      {text || " "}
    </time>
  );
}

/** The browser's IANA time zone (for CSV exports). */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
