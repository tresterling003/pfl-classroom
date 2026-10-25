import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// No 0/O, 1/I/L — easy to read off a projector and type on a Chromebook.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

/**
 * Fixed-window rate limit stored in the database, so it works across serverless instances.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db
    .insert(schema.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} = ${windowStart.toISOString()}::timestamptz then ${schema.rateLimits.count} + 1 else 1 end`,
        windowStart,
      },
    })
    .returning({ count: schema.rateLimits.count });
  // Opportunistic cleanup of stale rows (cheap; keeps the table tiny).
  if (Math.random() < 0.01) {
    await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.windowStart} < now() - interval '1 day'`);
  }
  return (rows[0]?.count ?? 1) <= limit;
}

export async function clearRateLimit(key: string) {
  const db = await getDb();
  await db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, key));
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
