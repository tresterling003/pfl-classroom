import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { courseBackup } from "@/lib/services/export";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const withWork = new URL(req.url).searchParams.get("work") === "1";
  const data = await courseBackup(t.id, (await params).id, withWork);
  const name = data.course.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "class";
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}-backup-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
