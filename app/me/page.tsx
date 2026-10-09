import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel, yen } from "@/lib/format";

export const metadata = { title: "給与明細" };

export default async function MyPayslipsPage({ searchParams }: PageProps<"/me">) {
  const me = await requireStaff();
  const { y } = await searchParams;
  const supabase = await createClient();
  const [{ data: slips }, { data: profile }] = await Promise.all([
    supabase
      .from("salary_records")
      .select("id, year, month, total_payment, total_deduction, net_payment")
      .eq("staff_id", me.id)
      .eq("status", "confirmed")
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.from("staff").select("role, hire_date, employee_no, department_name").eq("id", me.id).single(),
  ]);
  const latest = (slips ?? [])[0];
  // 年を選んで、その年の12か月を並べる（明細がある月だけ開ける）
  const years = [...new Set((slips ?? []).map((s) => s.year))];
  const year = years.includes(Number(y)) ? Number(y) : years[0];
  const ofYear = (slips ?? []).filter((s) => s.year === year);
  const sum = (k: "total_payment" | "total_deduction" | "net_payment") => ofYear.reduce((a, s) => a + Number(s[k]), 0);

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

      {years.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-500">年月を選ぶ</h2>
            <div className="flex flex-wrap gap-1.5">
              {years.map((yr) => (
                <Link key={yr} href={`/me?y=${yr}`} className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${yr === year ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                  {yr}年
                </Link>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
              const slip = ofYear.find((s) => s.month === mo);
              return slip ? (
                <Link key={mo} href={`/me/salary/${slip.id}`} className="rounded-md border border-line bg-white px-3 py-3 hover:border-brand hover:bg-brand-soft">
                  <p className="text-xs font-bold text-slate-500">{mo}月分</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{yen(slip.net_payment)}</p>
                </Link>
              ) : (
                <div key={mo} className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-slate-300">
                  <p className="text-xs font-bold">{mo}月分</p>
                  <p className="mt-1 text-sm">—</p>
                </div>
              );
            })}
          </div>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-sm">
            {[
              [`${year}年の支給合計`, sum("total_payment")],
              ["控除合計", sum("total_deduction")],
              ["差引支給合計", sum("net_payment")],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 font-bold tabular-nums text-slate-900">{yen(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-400">確定した月だけ開けます。月を押すと明細が開き、印刷・PDF保存もできます</p>
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
