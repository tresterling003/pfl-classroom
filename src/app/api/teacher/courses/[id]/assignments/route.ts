import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createAssignment } from "@/lib/services/assignments";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["review", "quiz", "practice", "test"]).default("review"),
  unitId: z.string().uuid().nullable().optional(),
  template: z.enum(["blank", "four_sections"]).default("blank"),
});
export const POST = route<Ctx>(async (req, { params }) => createAssignment((await requireTeacher()).id, (await params).id, await readJson(req, body)));
