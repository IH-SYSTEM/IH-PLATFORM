import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "会社マスタ" };

export default async function CompaniesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: companies }, { data: stores }, { data: staff }] = await Promise.all([
    supabase.from("companies").select("id, code, name, corporate_number, address, is_active").order("sort_order"),
    supabase.from("stores").select("id, name, code, company_id, is_active").order("sort_order", { nullsFirst: false }),
    supabase.from("staff").select("id, store_id, tax_company_id").eq("retired", false),
  ]);
  const storeCompany = new Map((stores ?? []).map((s) => [s.id, s.company_id]));
  const taxCompanyOf = (s: { store_id: string | null; tax_company_id: string | null }) => s.tax_company_id ?? (s.store_id ? storeCompany.get(s.store_id) : null);
  const unlinked = (stores ?? []).filter((s) => s.is_active && !s.company_id);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">会社マスタ</h1>
          <p className="mt-1 text-sm text-slate-500">店舗はいずれかの会社に属します。年末調整・源泉徴収票・法定帳簿・経費は会社ごとに扱います</p>
        </div>
        <Link href="/admin/companies/new" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-2">
          ＋ 会社を登録
        </Link>
      </div>

      {unlinked.length > 0 && (
        <p className="rounded-md bg-accent-soft px-4 py-3 text-sm text-accent">
          会社が未設定の店舗があります：{unlinked.map((s) => s.name).join("、")}（店舗マスタで設定してください）
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(companies ?? []).map((c) => {
          const own = (stores ?? []).filter((s) => s.company_id === c.id);
          const taxCount = (staff ?? []).filter((s) => taxCompanyOf(s) === c.id).length;
          return (
            <Link key={c.id} href={`/admin/companies/${c.id}`} className="group rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-slate-900 group-hover:text-brand">
                  <span className="mr-2 rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs text-brand">{c.code}</span>
                  {c.name}
                </h2>
                {!c.is_active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">未使用</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                法人番号 {c.corporate_number ?? <span className="text-accent">未登録</span>} ／ {c.address ?? "所在地未登録"}
              </p>
              <p className="mt-3 text-sm text-slate-700">店舗：{own.length ? own.map((s) => s.name).join("、") : "—"}</p>
              <p className="mt-1 text-xs text-slate-500">年末調整の対象（在籍）：{taxCount}名</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
