/** Request handling shared by the real student player and the teacher's preview. */
import "server-only";
import { z } from "zod";
import { schema } from "@/db";
import { badRequest, readJson } from "../http";
import { rateLimit } from "../security";
import { checkQuestion, getPlayerState, getRunResult, heartbeat, saveDraft, startSection, submitSection } from "./student";

type Attempt = typeof schema.attempts.$inferSelect;

const answersSchema = z.record(z.string().max(80), z.unknown()).refine((o) => Object.keys(o).length <= 400, "Too many answers");

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), sectionKey: z.string().max(80) }),
  z.object({ action: z.literal("save"), runId: z.string().max(40), answers: answersSchema, revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }),
  z.object({ action: z.literal("check"), runId: z.string().max(40), questionKey: z.string().max(80), answer: z.unknown() }),
  z.object({ action: z.literal("submit"), runId: z.string().max(40), answers: answersSchema }),
  z.object({ action: z.literal("result"), runId: z.string().max(40) }),
  z.object({ action: z.literal("heartbeat") }),
]);

export async function playerGet(attempt: Attempt) {
  return getPlayerState(attempt);
}

export async function playerPost(req: Request, attempt: Attempt) {
  const body = await readJson(req, actionSchema);
  if (!attempt.isPreview && !(await rateLimit(`p:${attempt.id}`, 1500, 600))) {
    throw badRequest("You're going a little fast — wait a moment and try again.");
  }
  switch (body.action) {
    case "start":
      return { runId: await startSection(attempt, body.sectionKey) };
    case "save":
      return saveDraft(attempt, body.runId, body.answers, body.revision);
    case "check":
      return checkQuestion(attempt, body.runId, body.questionKey, body.answer);
    case "submit":
      return submitSection(attempt, body.runId, body.answers);
    case "result":
      return getRunResult(attempt, body.runId);
    case "heartbeat":
      await heartbeat(attempt);
      return { ok: true };
  }
}
