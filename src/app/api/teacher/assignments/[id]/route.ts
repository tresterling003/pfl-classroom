import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteAssignment, getAssignmentDetail, updateAssignment } from "@/lib/services/assignments";
import { settingsSchema } from "@/lib/settings";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (_r, { params }) => getAssignmentDetail((await requireTeacher()).id, (await params).id));

const body = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(["review", "quiz", "practice", "test"]).optional(),
  directions: z.string().max(5000).optional(),
  unitId: z.string().uuid().nullable().optional(),
  settings: settingsSchema.optional(),
  opensAt: z.string().datetime({ offset: true }).nullable().optional(),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  periodIds: z.array(z.string().uuid()).max(50).optional(),
});
export const PATCH = route<Ctx>(async (req, { params }) => updateAssignment((await requireTeacher()).id, (await params).id, await readJson(req, body)));
export const DELETE = route<Ctx>(async (_r, { params }) => deleteAssignment((await requireTeacher()).id, (await params).id));
