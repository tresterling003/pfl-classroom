import { notFound } from "next/navigation";
import { requireTeacherPage } from "@/lib/auth";
import { getAttemptDetail } from "@/lib/services/results";
import { AttemptClient } from "./AttemptClient";

export const metadata = { title: "Student work" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacherPage();
  const { id } = await params;
  const d = await getAttemptDetail(t.id, id).catch(() => null);
  if (!d) notFound();
  const { tokenHash: _t, ...attempt } = d.attempt;
  return <AttemptClient data={JSON.parse(JSON.stringify({ ...d, attempt }))} />;
}
