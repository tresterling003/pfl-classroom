import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { importQuestions } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ questions: z.array(z.unknown()).max(2000) });
export const POST = route<Ctx>(async (req, { params }) => importQuestions((await requireTeacher()).id, (await params).id, (await readJson(req, body)).questions));
