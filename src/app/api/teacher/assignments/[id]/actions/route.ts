import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { archiveAssignment, duplicateAssignment, publishAssignment, regenerateJoinCode, setAssignmentOpen } from "@/lib/services/assignments";
import { deleteAllAttempts } from "@/lib/services/results";

type Ctx = { params: Promise<{ id: string }> };
const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["publish", "close", "archive", "unarchive", "regenerate_code", "delete_results"]) }),
  z.object({ action: z.literal("duplicate"), targetCourseId: z.string().uuid().optional(), title: z.string().trim().max(200).optional() }),
]);
export const POST = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  const b = await readJson(req, body);
  switch (b.action) {
    case "publish":
      return publishAssignment(t.id, id);
    case "close":
      return setAssignmentOpen(t.id, id, false);
    case "archive":
      return archiveAssignment(t.id, id, true);
    case "unarchive":
      return archiveAssignment(t.id, id, false);
    case "regenerate_code":
      return { joinCode: await regenerateJoinCode(t.id, id) };
    case "delete_results":
      return deleteAllAttempts(t.id, id);
    case "duplicate":
      return duplicateAssignment(t.id, id, { targetCourseId: b.targetCourseId, title: b.title || undefined });
  }
});
