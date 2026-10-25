"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function PeriodSelect({ periods, value }: { periods: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <Select value={value} onChange={(e) => router.push(`?period=${e.target.value}`)} className="w-44" aria-label="Period">
      <option value="">All periods</option>
      {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select>
  );
}
