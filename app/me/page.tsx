import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate, roleLabel } from "@/lib/format";
import { Payslip, PAYSLIP_COLUMNS, type PayslipRecord } from "@/app/payslip";
import { PrintButton } from "@/app/print-button";
import { MonthPicker } from "./month-picker";

export const metadata = { title: "給与明細" };

// 給与明細：右上で年・月を選ぶと、その月の明細をこの画面に出す（最初は最新の月）。確定した月だけ
export default async function MyPayslipsPage({ searchParams }: PageProps<"/me">) {
  const me = await requireStaff();
  const { y, m } = await searchParams;
  const supabase = await createClient();
  const [{ data: list }, { data: profile }] = await Promise.all([
    supabase
      .from("salary_records")
      .select("id, year, month")
      .eq("staff_id", me.id)
      .eq("status", "confirmed")
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.from("staff").select("role, hire_date, employee_no, department_name").eq("id", me.id).single(),
  ]);
  const months = list ?? [];
  const picked = months.find((s) => s.year === Number(y) && s.month === Number(m)) ?? months[0];
  const { data: slip } = picked
    ? await supabase.from("salary_records").select(PAYSLIP_COLUMNS).eq("id", picked.id).eq("staff_id", me.id).eq("status", "confirmed").maybeSingle<PayslipRecord>()
    : { data: null };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">給与明細</h1>
        {picked && <MonthPicker months={months} year={picked.year} month={picked.month} />}
      </div>

      {slip ? (
        <>
          <div className="rounded-md border border-line bg-white p-5 print:border-0 print:p-0">
            <Payslip r={slip} department={profile?.department_name} />
          </div>
          <div className="no-print flex justify-end">
            <PrintButton label="この明細を印刷・PDF保存" />
          </div>
        </>
      ) : (
        <p className="rounded-md border border-line bg-white p-8 text-center text-sm text-slate-400">確定済みの給与明細はまだありません</p>
      )}

      <section className="no-print">
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
