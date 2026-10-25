import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteSection, updateSection } from "@/lib/services/assignments";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  instructions: z.string().max(2000).optional(),
  settings: z.object({ passPercent: z.number().min(0).max(100).nullable().optional(), drawCount: z.number().int().min(0).max(300).nullable().optional() }).optional(),
});
export const PATCH = route<Ctx>(async (req, { params }) => updateSection((await requireTeacher()).id, (await params).id, await readJson(req, body)));
export const DELETE = route<Ctx>(async (_r, { params }) => deleteSection((await requireTeacher()).id, (await params).id));
