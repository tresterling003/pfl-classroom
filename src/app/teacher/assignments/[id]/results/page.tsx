import { notFound } from "next/navigation";
import { requireTeacherPage } from "@/lib/auth";
import { getAssignmentResults } from "@/lib/services/results";
import { ownedAssignment } from "@/lib/services/access";
import { ResultsClient } from "./ResultsClient";

export const metadata = { title: "Results" };

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string }> }) {
  const t = await requireTeacherPage();
  const { id } = await params;
  const { period } = await searchParams;
  const owned = await ownedAssignment(t.id, id).catch(() => null);
  if (!owned) notFound();
  const data = await getAssignmentResults(t.id, id, { periodId: period || undefined });
  return <ResultsClient data={JSON.parse(JSON.stringify(data))} courseName={owned.course.name} periodId={period ?? ""} />;
}
