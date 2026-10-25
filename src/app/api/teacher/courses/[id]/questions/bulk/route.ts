import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { bulkQuestions } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["archive", "unarchive", "delete"]) }),
    z.object({
      kind: z.literal("set"),
      topic: z.string().trim().max(120).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      unitId: z.string().uuid().nullable().optional(),
      points: z.number().min(0).max(100).optional(),
    }),
    z.object({ kind: z.literal("copy"), targetCourseId: z.string().uuid() }),
  ]),
});
export const POST = route<Ctx>(async (req, { params }) => {
  const b = await readJson(req, body);
  return bulkQuestions((await requireTeacher()).id, (await params).id, b.ids, b.action);
});
