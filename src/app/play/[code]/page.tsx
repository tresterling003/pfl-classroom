import { PlayClient } from "./PlayClient";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayClient code={code.toUpperCase().replace(/[^A-Z0-9]/g, "")} />;
}
