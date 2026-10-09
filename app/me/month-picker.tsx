"use client";

import { useRouter } from "next/navigation";

const select = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900";

/** 給与明細の年・月を選ぶ。確定した明細がある年・月だけ選べる */
export function MonthPicker({ months, year, month }: { months: { year: number; month: number }[]; year: number; month: number }) {
  const router = useRouter();
  const years = [...new Set(months.map((m) => m.year))];
  const ofYear = months.filter((m) => m.year === year).map((m) => m.month);
  return (
    <div className="no-print flex items-center gap-2">
      <select
        aria-label="年"
        value={year}
        onChange={(e) => {
          const y = Number(e.target.value);
          const latest = Math.max(...months.filter((m) => m.year === y).map((m) => m.month));
          router.push(`/me?y=${y}&m=${latest}`);
        }}
        className={select}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}年
          </option>
        ))}
      </select>
      <select aria-label="月" value={month} onChange={(e) => router.push(`/me?y=${year}&m=${e.target.value}`)} className={select}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m} disabled={!ofYear.includes(m)}>
            {m}月分{ofYear.includes(m) ? "" : "（なし）"}
          </option>
        ))}
      </select>
    </div>
  );
}
