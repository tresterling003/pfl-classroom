import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createPeriod } from "@/lib/services/courses";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ name: z.string().trim().min(1).max(60) });
export const POST = route<Ctx>(async (req, { params }) => createPeriod((await requireTeacher()).id, (await params).id, (await readJson(req, body)).name));
