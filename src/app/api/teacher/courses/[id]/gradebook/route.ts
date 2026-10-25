import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { courseGradebook, courseGradebookCsv } from "@/lib/services/gradebook";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const periodId = sp.get("period") || undefined;
  if (sp.get("format") === "csv") {
    const { csv, filename } = await courseGradebookCsv(t.id, id, periodId);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  return courseGradebook(t.id, id, periodId);
});
