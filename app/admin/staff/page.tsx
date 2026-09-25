import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel } from "@/lib/format";
import { permissionLabel } from "@/lib/staff";

export default async function StaffListPage({ searchParams }: PageProps<"/admin/staff">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = params.tab === "retired" ? "retired" : "active";
  const storeFilter = typeof params.store === "string" ? params.store : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, furigana, employee_no, role, permission, store_id, department_name, hire_date, retired, retirement_date")
      .order("furigana", { ascending: true, nullsFirst: false }),
    supabase.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }).order("name"),
  ]);

  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const all = staff ?? [];
  const counts = { active: all.filter((s) => !s.retired).length, retired: all.filter((s) => s.retired).length };
  const rows = all.filter(
    (s) =>
      (tab === "retired" ? s.retired : !s.retired) &&
      (!storeFilter || s.store_id === storeFilter) &&
      (!q || [s.name, s.furigana, s.employee_no].some((v) => v?.replace(/\s/g, "").includes(q.replace(/\s/g, "")))),
  );

  const tabHref = (t: string) => `/admin/staff?tab=${t}${storeFilter ? `&store=${storeFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">スタッフ管理</h1>
          <p className="mt-1 text-sm text-slate-500">登録・編集・給与マスタの設定</p>
        </div>
        <Link href="/admin/staff/new" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
          ＋ スタッフを登録
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-200/70 p-1 text-sm">
          {(["active", "retired"] as const).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={`rounded-md px-3.5 py-1.5 font-medium ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t === "active" ? "在籍" : "退職"}
              <span className="ml-1.5 text-xs text-slate-400">{counts[t]}</span>
            </Link>
          ))}
        </div>
        <form className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select
            name="store"
            defaultValue={storeFilter}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">すべての店舗</option>
            {(stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            name="q"
            defaultValue={q}
            placeholder="氏名・ふりがな・社員番号で検索"
            className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            絞り込む
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">社員番号</th>
              <th className="px-4 py-3 font-medium">所属</th>
              <th className="px-4 py-3 font-medium">雇用区分</th>
              <th className="px-4 py-3 font-medium">権限</th>
              <th className="px-4 py-3 font-medium">{tab === "retired" ? "退職日" : "入社日"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="group">
                <td className="px-4 py-3">
                  <Link href={`/admin/staff/${s.id}`} className="block font-medium text-slate-900 group-hover:text-indigo-600">
                    {s.name}
                    {s.furigana && <span className="block text-xs font-normal text-slate-400">{s.furigana}</span>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.employee_no ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {(s.store_id && storeName.get(s.store_id)) ?? s.department_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{roleLabel(s.role)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.permission === "admin" || s.permission === "superadmin"
                        ? "bg-indigo-50 text-indigo-700"
                        : s.permission === "store"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {permissionLabel(s.permission)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{jpDate(tab === "retired" ? s.retirement_date : s.hire_date)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  該当するスタッフはいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
