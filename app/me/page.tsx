import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel, yen } from "@/lib/format";

export default async function StaffHome() {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ data: slips }, { data: profile }] = await Promise.all([
    supabase
      .from("salary_records")
      .select("id, year, month, total_payment, total_deduction, net_payment")
      .eq("staff_id", me.id)
      .eq("status", "confirmed")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(13),
    supabase.from("staff").select("role, hire_date, employee_no, stores(name)").eq("id", me.id).single(),
  ]);

  const [latest, ...past] = slips ?? [];
  const store = profile?.stores as unknown as { name: string } | null;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-stone-500">こんにちは</p>
        <h1 className="text-2xl font-bold text-stone-900">{me.name} さん</h1>
      </section>

      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-lg shadow-emerald-900/10">
        {latest ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-emerald-50">最新の給与明細</p>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                {latest.year}年{latest.month}月分
              </span>
            </div>
            <p className="mt-5 text-xs text-emerald-100">差引支給額</p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{yen(latest.net_payment)}</p>
            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 text-sm">
              <div>
                <dt className="text-emerald-100">支給合計</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{yen(latest.total_payment)}</dd>
              </div>
              <div>
                <dt className="text-emerald-100">控除合計</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{yen(latest.total_deduction)}</dd>
              </div>
            </dl>
            <Link
              href={`/me/salary/${latest.id}`}
              className="mt-5 block rounded-xl bg-white/15 py-2.5 text-center text-sm font-semibold hover:bg-white/25"
            >
              明細を見る
            </Link>
          </>
        ) : (
          <div className="py-4">
            <p className="text-sm font-medium text-emerald-50">給与明細</p>
            <p className="mt-2 text-lg font-semibold">確定済みの給与明細はまだありません</p>
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-stone-500">過去の明細</h2>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {past.map((s) => (
              <li key={s.id}>
                <Link href={`/me/salary/${s.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-stone-50">
                  <span className="text-sm font-medium text-stone-700">
                    {s.year}年{s.month}月分
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-stone-900">
                    {yen(s.net_payment)}
                    <span aria-hidden className="ml-2 text-stone-400">›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-stone-500">わたしの情報</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
          {[
            ["所属", store?.name ?? "—"],
            ["雇用区分", roleLabel(profile?.role)],
            ["入社日", jpDate(profile?.hire_date)],
            ["社員番号", profile?.employee_no ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-3.5">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-stone-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <Link
          href="/account/password"
          className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 text-sm font-medium text-stone-700 hover:border-emerald-400 hover:bg-emerald-50/50"
        >
          パスワードを変更する
          <span aria-hidden className="text-stone-400">›</span>
        </Link>
      </section>
    </div>
  );
}
