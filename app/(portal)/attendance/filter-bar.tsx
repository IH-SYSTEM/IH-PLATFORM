"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

// 店舗・月・スタッフを選ぶと、その条件で表示し直す
export function FilterBar({
  stores,
  staff,
  store,
  month,
  staffId,
}: {
  stores: Option[];
  staff: Option[];
  store: string;
  month: string;
  staffId: string;
}) {
  const router = useRouter();
  const go = (next: Partial<{ store: string; month: string; staff: string }>) => {
    const q = new URLSearchParams({ store, month, staff: staffId, ...next });
    if (!q.get("staff")) q.delete("staff");
    router.push(`/attendance?${q}`);
  };
  const select = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";

  return (
    <div className="grid gap-3 rounded-md border border-line bg-white p-4 sm:grid-cols-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">店舗</span>
        <select value={store} onChange={(e) => go({ store: e.target.value, staff: "" })} className={select} disabled={stores.length < 2}>
          {stores.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">月</span>
        <input type="month" value={month} onChange={(e) => e.target.value && go({ month: e.target.value })} className={select} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">スタッフ</span>
        <select value={staffId} onChange={(e) => go({ staff: e.target.value })} className={select}>
          <option value="">全員</option>
          {staff.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
