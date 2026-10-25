import { requireTeacher } from "@/lib/auth";
import { HttpError, badRequest, route } from "@/lib/http";
import { ownedAssignment } from "@/lib/services/access";
import { buildSnapshot } from "@/lib/services/assignments";
import { createPreviewAttempt, getPreviewAttempt } from "@/lib/services/student";
import { playerGet, playerPost } from "@/lib/services/playerApi";

type Ctx = { params: Promise<{ id: string }> };

/** Teacher "Preview as student" — same engine as students, on a private copy of the draft. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  await ownedAssignment(t.id, id);
  const att = await getPreviewAttempt(id);
  if (!att) throw new HttpError(401, "Preview not started", "NOT_JOINED");
  return playerGet(att);
});

export const POST = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  await ownedAssignment(t.id, id);
  const peek = (await req.clone().json().catch(() => ({}))) as { action?: string };
  if (peek.action === "reset") {
    const { snapshot, problems } = await buildSnapshot(t.id, id);
    if (!snapshot.sections.some((s) => s.questions.length)) throw badRequest("Add some questions before previewing.");
    // empty sections are skipped in preview so you can try a work-in-progress
    snapshot.sections = snapshot.sections.filter((s) => s.questions.length);
    await createPreviewAttempt(id, snapshot);
    return { ok: true, problems };
  }
  const att = await getPreviewAttempt(id);
  if (!att) throw new HttpError(401, "Preview not started", "NOT_JOINED");
  return playerPost(req, att);
});
