import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { ownedQuestion } from "@/lib/services/access";
import { deleteQuestion, questionUsage, updateQuestion } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (_r, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  const q = await ownedQuestion(t.id, id);
  return { ...q, usedIn: (await questionUsage([id])).get(id) ?? [] };
});
export const PUT = route<Ctx>(async (req, { params }) => updateQuestion((await requireTeacher()).id, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = route<Ctx>(async (_r, { params }) => deleteQuestion((await requireTeacher()).id, (await params).id));
