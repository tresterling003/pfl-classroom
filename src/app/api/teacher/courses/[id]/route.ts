import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteCourse, updateCourse } from "@/lib/services/courses";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  color: z.string().max(20).optional(),
  archived: z.boolean().optional(),
});
export const PATCH = route<Ctx>(async (req, { params }) => updateCourse((await requireTeacher()).id, (await params).id, await readJson(req, body)));
export const DELETE = route<Ctx>(async (_r, { params }) => deleteCourse((await requireTeacher()).id, (await params).id));
