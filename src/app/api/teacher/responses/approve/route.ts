import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { approveResponses } from "@/lib/services/results";

const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });
export const POST = route(async (req) => approveResponses((await requireTeacher()).id, (await readJson(req, body)).ids));
