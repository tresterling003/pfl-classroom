import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { approveAllReady } from "@/lib/services/results";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ periodId: z.string().uuid().optional() });
export const POST = route<Ctx>(async (req, { params }) => approveAllReady((await requireTeacher()).id, (await params).id, (await readJson(req, body)).periodId));
