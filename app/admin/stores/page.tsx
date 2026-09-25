import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StoresPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: stores }, { data: staff }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, open_time, close_time, target_labor_cost_rate, manager_staff_ids, is_active, sort_order")
      .order("sort_order", { nullsFirst: false })
      .order("name"),
    supabase.from("staff").select("id, name, store_id").eq("retired", false),
  ]);

  const headcount = new Map<string, number>();
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.name]));
  for (const s of staff ?? []) if (s.store_id) headcount.set(s.store_id, (headcount.get(s.store_id) ?? 0) + 1);
  const active = (stores ?? []).filter((s) => s.is_active);
  const inactive = (stores ?? []).filter((s) => !s.is_active);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">店舗・部署マスタ</h1>
          <p className="mt-1 text-sm text-slate-500">スタッフの所属先になる店舗・部署を管理します</p>
        </div>
        <Link href="/admin/stores/new" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
          ＋ 店舗を登録
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((s) => (
          <Link
            key={s.id}
            href={`/admin/stores/${s.id}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900 group-hover:text-indigo-600">{s.name}</h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {headcount.get(s.id) ?? 0}名
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{s.address ?? "住所未登録"}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
              <div>
                <dt className="text-slate-400">営業時間</dt>
                <dd className="mt-0.5 font-medium text-slate-700">{s.open_time && s.close_time ? `${s.open_time}〜${s.close_time}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">目標人件費率</dt>
                <dd className="mt-0.5 font-medium text-slate-700">
                  {s.target_labor_cost_rate !== null ? `${Math.round(s.target_labor_cost_rate * 1000) / 10}%` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">店長</dt>
                <dd className="mt-0.5 truncate font-medium text-slate-700">
                  {s.manager_staff_ids.map((id: string) => nameById.get(id)).filter(Boolean).join("、") || "—"}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      {inactive.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">使用していない店舗</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {inactive.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/stores/${s.id}`} className="flex justify-between px-5 py-3 text-sm text-slate-500 hover:text-slate-900">
                  {s.name}
                  <span className="text-xs">{headcount.get(s.id) ?? 0}名</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
