import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { createQuestion, listQuestions } from "@/lib/services/questions";
import type { QuestionType } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (req, { params }) => {
  const sp = new URL(req.url).searchParams;
  return listQuestions((await requireTeacher()).id, (await params).id, {
    search: sp.get("q") ?? undefined,
    type: (sp.get("type") ?? "") as QuestionType | "",
    unitId: sp.get("unit") ?? "",
    topic: sp.get("topic") ?? undefined,
    difficulty: sp.get("difficulty") ?? undefined,
    archived: sp.get("archived") === "1",
  });
});
export const POST = route<Ctx>(async (req, { params }) => createQuestion((await requireTeacher()).id, (await params).id, await req.json().catch(() => ({}))));
