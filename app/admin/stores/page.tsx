import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { displayUrl } from "@/lib/punch";
import { CopyButton } from "./copy-button";

export default async function StoresPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: stores }, { data: staff }, { data: displayKeys }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, code, address, open_time, close_time, target_labor_cost_rate, manager_staff_ids, is_active, sort_order, lat, lng")
      .order("sort_order", { nullsFirst: false })
      .order("name"),
    supabase.from("staff").select("id, name, store_id").eq("retired", false),
    supabase.from("store_display_keys").select("store_id, display_key"),
  ]);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const keyByStore = new Map((displayKeys ?? []).map((k) => [k.store_id, k.display_key]));

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
        <Link href="/admin/stores/new" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-2">
          ＋ 店舗を登録
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((s) => (
          <Link
            key={s.id}
            href={`/admin/stores/${s.id}`}
            className="group rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900 group-hover:text-brand">
                {s.code && <span className="mr-2 rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs text-brand">{s.code}</span>}
                {s.name}
              </h2>
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

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">打刻QRの掲示用URL</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          各店舗の iPad でこのURLを開きっぱなしにします。iPad が店舗から打刻可能範囲内にあるときだけQRが表示されます。URLは外部に共有しないでください
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {active.map((s) => {
            const key = keyByStore.get(s.id);
            const url = s.code && key ? displayUrl(origin, s.code, key) : null;
            const missing = !s.code ? "店舗コード未登録" : !key ? "URL未発行" : s.lat === null || s.lng === null ? "緯度・経度未登録" : null;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-12 shrink-0 font-mono text-sm font-bold text-brand">{s.code ?? "—"}</span>
                <span className="w-56 shrink-0 truncate text-sm font-medium text-slate-800">{s.name}</span>
                {url ? (
                  <>
                    <code className="min-w-0 flex-1 truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{url}</code>
                    <CopyButton text={url} />
                  </>
                ) : (
                  <span className="flex-1 text-xs text-slate-400">—</span>
                )}
                {missing && (
                  <Link href={`/admin/stores/${s.id}`} className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {missing}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {inactive.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">使用していない店舗</h2>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
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
