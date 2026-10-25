import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { overrideResponse } from "@/lib/services/results";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ score: z.number().min(0).max(100).nullable(), feedback: z.string().max(2000).nullable().optional() });
export const PATCH = route<Ctx>(async (req, { params }) => overrideResponse((await requireTeacher()).id, (await params).id, await readJson(req, body)));
