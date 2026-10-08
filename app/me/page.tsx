import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel, yen } from "@/lib/format";

export const metadata = { title: "給与明細" };

export default async function MyPayslipsPage() {
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
    supabase.from("staff").select("role, hire_date, employee_no, department_name").eq("id", me.id).single(),
  ]);
  const [latest, ...past] = slips ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">給与明細</h1>

      <section className="rounded-md bg-brand p-6 text-white">
        {latest ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/70">最新の給与明細</p>
              <span className="rounded-sm bg-white/10 px-2.5 py-1 text-xs font-bold">
                {latest.year}年{latest.month}月分
              </span>
            </div>
            <p className="mt-5 text-xs text-white/60">差引支給額</p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{yen(latest.net_payment)}</p>
            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm">
              <div>
                <dt className="text-white/60">支給合計</dt>
                <dd className="mt-0.5 font-bold tabular-nums">{yen(latest.total_payment)}</dd>
              </div>
              <div>
                <dt className="text-white/60">控除合計</dt>
                <dd className="mt-0.5 font-bold tabular-nums">{yen(latest.total_deduction)}</dd>
              </div>
            </dl>
            <Link href={`/me/salary/${latest.id}`} className="mt-5 block rounded-md bg-accent py-2.5 text-center text-sm font-bold hover:bg-[#b8000a]">
              明細を見る
            </Link>
          </>
        ) : (
          <p className="py-4 text-base font-bold">確定済みの給与明細はまだありません</p>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-500">過去の明細</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {past.map((s) => (
              <li key={s.id}>
                <Link href={`/me/salary/${s.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-brand-soft">
                  <span className="text-sm font-medium text-slate-700">
                    {s.year}年{s.month}月分
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {yen(s.net_payment)}
                    <span aria-hidden className="ml-2 text-slate-400">›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500">わたしの情報</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
          {[
            ["所属", profile?.department_name ?? "—"],
            ["雇用区分", roleLabel(profile?.role)],
            ["入社日", jpDate(profile?.hire_date)],
            ["社員番号", profile?.employee_no ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-3.5">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
