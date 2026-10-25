import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createCourse, listCourses } from "@/lib/services/courses";

export const GET = route(async () => listCourses((await requireTeacher()).id, { includeArchived: true }));

const body = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  color: z.string().max(20).optional(),
  periods: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});
export const POST = route(async (req) => createCourse((await requireTeacher()).id, await readJson(req, body)));
