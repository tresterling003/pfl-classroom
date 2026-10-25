import { cookies } from "next/headers";
import { z } from "zod";
import { badRequest, readJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security";
import { getJoinInfo, joinAssignment, studentCookieName } from "@/lib/services/student";

const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().max(80),
  periodId: z.string().uuid().nullable(),
  resumeCode: z.string().max(20).optional(),
});

/** GET ?code=XXXX → public assignment info for the join screen. */
export const GET = route(async (req) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!(await rateLimit(`info:${clientIp(req)}`, 600, 600))) throw badRequest("Too many tries. Wait a minute.");
  return getJoinInfo(code);
});

export const POST = route(async (req) => {
  const body = await readJson(req, schema);
  // A whole school may share one IP address, so this limit is generous.
  if (!(await rateLimit(`join:${clientIp(req)}`, 400, 600))) throw badRequest("Too many tries from this network. Wait a few minutes.");
  if (body.resumeCode && !(await rateLimit(`resume:${clientIp(req)}:${body.name.toLowerCase()}`, 8, 600))) {
    throw badRequest("Too many resume code attempts. Ask your teacher for help.");
  }
  const res = await joinAssignment(body);
  (await cookies()).set(studentCookieName(res.assignmentId), res.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 200,
  });
  const info = await getJoinInfo(body.code);
  return { ok: true, resumed: res.resumed, code: info.code };
});
