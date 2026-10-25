import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteStudentDataBefore } from "@/lib/services/results";

const body = z.object({ before: z.string().datetime({ offset: true }) });
export const POST = route(async (req) => deleteStudentDataBefore((await requireTeacher()).id, new Date((await readJson(req, body)).before)));
