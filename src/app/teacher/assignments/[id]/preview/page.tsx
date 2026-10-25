import { requireTeacherPage } from "@/lib/auth";
import { ownedAssignment } from "@/lib/services/access";
import { notFound } from "next/navigation";
import { PreviewClient } from "./PreviewClient";

export const metadata = { title: "Preview" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacherPage();
  const { id } = await params;
  const ok = await ownedAssignment(t.id, id).catch(() => null);
  if (!ok) notFound();
  return <PreviewClient assignmentId={id} />;
}
