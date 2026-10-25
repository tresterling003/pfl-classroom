import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createUnit } from "@/lib/services/courses";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ name: z.string().trim().min(1).max(120) });
export const POST = route<Ctx>(async (req, { params }) => createUnit((await requireTeacher()).id, (await params).id, (await readJson(req, body)).name));
