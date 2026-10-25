import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { exportQuestions } from "@/lib/services/questions";
import { ownedCourse } from "@/lib/services/access";
import { questionsToCsv } from "@/lib/questionCsv";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  const course = await ownedCourse(t.id, id);
  const sp = new URL(req.url).searchParams;
  const ids = sp.get("ids")?.split(",").filter(Boolean);
  const items = await exportQuestions(t.id, id, ids);
  const base = course.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "class";
  if (sp.get("format") === "csv") {
    return new Response(questionsToCsv(items), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-questions.csv"` },
    });
  }
  return new Response(JSON.stringify({ format: "pfl-classroom-questions", version: 1, questions: items }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}-questions.json"` },
  });
});
