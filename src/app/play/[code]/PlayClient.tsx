"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Player } from "@/components/player/Player";

export function PlayClient({ code }: { code: string }) {
  const router = useRouter();
  const notJoined = useCallback(() => router.replace(`/join/${code}`), [router, code]);
  return <Player apiBase={`/api/s/${code}`} onNotJoined={notJoined} />;
}
