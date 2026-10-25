import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteAttempt, setApprovedGrade } from "@/lib/services/results";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ approvedGrade: z.number().min(0).max(1000).nullable(), note: z.string().max(2000).optional() });
export const PATCH = route<Ctx>(async (req, { params }) => {
  const b = await readJson(req, body);
  return setApprovedGrade((await requireTeacher()).id, (await params).id, b.approvedGrade, b.note);
});
export const DELETE = route<Ctx>(async (_r, { params }) => deleteAttempt((await requireTeacher()).id, (await params).id));
