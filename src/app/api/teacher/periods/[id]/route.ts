import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deletePeriod, updatePeriod } from "@/lib/services/courses";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ name: z.string().trim().min(1).max(60).optional(), archived: z.boolean().optional(), sortOrder: z.number().int().optional() });
export const PATCH = route<Ctx>(async (req, { params }) => updatePeriod((await requireTeacher()).id, (await params).id, await readJson(req, body)));
export const DELETE = route<Ctx>(async (_r, { params }) => deletePeriod((await requireTeacher()).id, (await params).id));
