import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const forbidden = (msg = "Not allowed") => new HttpError(403, msg);

/** Reject cross-site form posts: mutating requests must come from our own pages. */
function checkOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-to-server tests
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Bad origin");
  }
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 2_000_000) throw new HttpError(413, "Request too large");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(`${issue.path.join(".") || "input"}: ${issue.message}`);
  }
  return parsed.data;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wraps a route handler: origin check, JSON responses, consistent error handling. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      checkOrigin(req);
      const out = await handler(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong on the server. Please try again." }, { status: 500 });
    }
  };
}
