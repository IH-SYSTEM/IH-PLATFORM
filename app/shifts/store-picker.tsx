"use client";

import { useRouter } from "next/navigation";

export function StorePicker({ stores, value, week }: { stores: { value: string; label: string }[]; value: string; week: string }) {
  const router = useRouter();
  return (
    <select
      value={value}
      disabled={stores.length < 2}
      onChange={(e) => router.push(`/shifts?${new URLSearchParams({ store: e.target.value, week })}`)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
    >
      {stores.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
