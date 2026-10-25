import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { setSectionQuestions } from "@/lib/services/assignments";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ questionIds: z.array(z.string().uuid()).max(300) });
export const PUT = route<Ctx>(async (req, { params }) => ({ count: await setSectionQuestions((await requireTeacher()).id, (await params).id, (await readJson(req, body)).questionIds) }));
