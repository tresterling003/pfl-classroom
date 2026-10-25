import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";
import { ownedAssignment } from "@/lib/services/access";
import { resultsCsv } from "@/lib/services/export";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>(async (req, { params }) => {
  const t = await requireTeacher();
  const { id } = await params;
  const { assignment } = await ownedAssignment(t.id, id);
  const sp = new URL(req.url).searchParams;
  const periodId = sp.get("period") || undefined;
  const csv = await resultsCsv(t.id, id, { periodId, timeZone: sp.get("tz") ?? undefined });
  let periodName = "all-periods";
  if (periodId) {
    const db = await getDb();
    const [p] = await db.select().from(schema.periods).where(eq(schema.periods.id, periodId));
    periodName = p?.name ?? "period";
  }
  const filename = `${assignment.title}-${periodName}-grades.csv`.replace(/[^a-z0-9.\-]+/gi, "-").slice(0, 120);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
});
