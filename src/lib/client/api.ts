/** Browser-side JSON fetch helper with friendly errors. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; keepalive?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      keepalive: opts.keepalive,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.", "OFFLINE");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string };
    if (res.status === 401 && typeof window !== "undefined" && url.startsWith("/api/teacher")) {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.code);
  }
  return data as T;
}
