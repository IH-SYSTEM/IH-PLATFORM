"use client";

import { useRouter } from "next/navigation";

/** 店を選ぶとURLを変える（見方と日付は残す） */
export function StoreSelect({ stores, value, params }: { stores: { id: string; name: string }[]; value: string; params: Record<string, string> }) {
  const router = useRouter();
  if (stores.length < 2) return <p className="text-sm font-bold text-slate-800">{stores[0]?.name}</p>;
  return (
    <select
      value={value}
      onChange={(e) => router.push(`/workboard?${new URLSearchParams({ ...params, store: e.target.value })}`)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
    >
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
