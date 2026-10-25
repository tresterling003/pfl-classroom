import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { addSection, reorderSections } from "@/lib/services/assignments";

type Ctx = { params: Promise<{ id: string }> };
const add = z.object({ title: z.string().trim().min(1).max(120), instructions: z.string().max(2000).optional() });
const order = z.object({ sectionIds: z.array(z.string().uuid()).max(50) });
export const POST = route<Ctx>(async (req, { params }) => addSection((await requireTeacher()).id, (await params).id, await readJson(req, add)));
export const PUT = route<Ctx>(async (req, { params }) => reorderSections((await requireTeacher()).id, (await params).id, (await readJson(req, order)).sectionIds));
