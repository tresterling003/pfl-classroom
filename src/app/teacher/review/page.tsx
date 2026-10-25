import { requireTeacherPage } from "@/lib/auth";
import { reviewQueue } from "@/lib/services/results";
import { ReviewClient } from "./ReviewClient";

export const metadata = { title: "Needs review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ assignment?: string }> }) {
  const t = await requireTeacherPage();
  const { assignment } = await searchParams;
  const items = await reviewQueue(t.id, assignment && /^[0-9a-f-]{36}$/.test(assignment) ? assignment : undefined);
  return <ReviewClient items={JSON.parse(JSON.stringify(items))} filtered={!!assignment} />;
}
