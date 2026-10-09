"use client";

import { useRouter } from "next/navigation";

/** 選ぶとURLを変える（店舗・人の切り替え）。params は残したい条件、name は変える条件の名前 */
export function StorePicker({
  stores,
  value,
  week,
  params,
  name = "store",
  placeholder,
}: {
  stores: { value: string; label: string }[];
  value: string;
  week?: string;
  params?: Record<string, string>;
  name?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      disabled={!placeholder && stores.length < 2}
      onChange={(e) => router.push(`/shifts?${new URLSearchParams({ ...(params ?? (week ? { week } : {})), [name]: e.target.value })}`)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {stores.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
