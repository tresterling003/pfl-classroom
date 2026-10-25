import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { duplicateQuestion } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ targetCourseId: z.string().uuid().optional() });
export const POST = route<Ctx>(async (req, { params }) => duplicateQuestion((await requireTeacher()).id, (await params).id, (await readJson(req, body)).targetCourseId));
