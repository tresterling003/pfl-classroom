import { cookies } from "next/headers";
import { HttpError, route } from "@/lib/http";
import { attemptFromToken, getJoinInfo, studentCookieName } from "@/lib/services/student";
import { playerGet, playerPost } from "@/lib/services/playerApi";

type Ctx = { params: Promise<{ code: string }> };

async function resolve(code: string) {
  const info = await getJoinInfo(code);
  const token = (await cookies()).get(studentCookieName(info.assignmentId))?.value;
  const { attempt } = await attemptFromToken(code, token);
  if (!attempt) throw new HttpError(401, "Please enter your name to start.", "NOT_JOINED");
  return attempt;
}

/** GET → the student's current state (questions without answer keys). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { code } = await params;
  return playerGet(await resolve(code));
});

/** POST {action: start|save|check|submit|result|heartbeat|leave} */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const peek = req.clone();
  const body = (await peek.json().catch(() => ({}))) as { action?: string };
  if (body.action === "leave") {
    const info = await getJoinInfo(code);
    (await cookies()).delete(studentCookieName(info.assignmentId));
    return { ok: true };
  }
  return playerPost(req, await resolve(code));
});
