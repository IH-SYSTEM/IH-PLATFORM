import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel } from "@/lib/format";

export default async function RosterPage({ searchParams }: PageProps<"/admin/roster">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = params.tab === "retired" ? "retired" : "active";
  const store = typeof params.store === "string" ? params.store : "";
  const supabase = await createClient();

  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, furigana, role, store_id, department_name, hire_date, retirement_date, retired")
      .order("furigana", { nullsFirst: false }),
    supabase.from("stores").select("id, name").order("sort_order", { nullsFirst: false }).order("name"),
  ]);

  const rows = (staff ?? []).filter((s) => (tab === "retired" ? s.retired : !s.retired) && (!store || s.store_id === store));
  const qs = (t: string) => `tab=${t}${store ? `&store=${store}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">労働者名簿</h1>
          <p className="mt-1 text-sm text-slate-500">労働基準法第107条に基づく名簿を、1名1ページのA4で出力します</p>
        </div>
        {rows.length > 0 && (
          <Link
            href={`/admin/roster/print?${qs(tab)}`}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            表示中の{rows.length}名をまとめて出力
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-200/70 p-1 text-sm">
          {(["active", "retired"] as const).map((t) => (
            <Link
              key={t}
              href={`/admin/roster?${qs(t)}`}
              className={`rounded-md px-3.5 py-1.5 font-medium ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t === "active" ? "在籍" : "退職"}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select name="store" defaultValue={store} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">すべての店舗</option>
            {(stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">絞り込む</button>
        </form>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {s.name}
                {s.furigana && <span className="ml-2 text-xs font-normal text-slate-400">{s.furigana}</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {s.department_name ?? "未所属"} ・ {roleLabel(s.role)} ・{" "}
                {tab === "retired" ? `退職 ${jpDate(s.retirement_date)}` : `入社 ${jpDate(s.hire_date)}`}
              </p>
            </div>
            <Link
              href={`/admin/roster/print?id=${s.id}`}
              className="shrink-0 rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
            >
              出力
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-5 py-12 text-center text-sm text-slate-400">該当するスタッフはいません</li>}
      </ul>
    </div>
  );
}
