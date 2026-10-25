import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { acceptAnswerForAll } from "@/lib/services/results";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ sourceQuestionId: z.string().uuid(), answer: z.string().min(1).max(300) });
export const POST = route<Ctx>(async (req, { params }) => {
  const b = await readJson(req, body);
  return acceptAnswerForAll((await requireTeacher()).id, (await params).id, b.sourceQuestionId, b.answer);
});
