import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Payslip, PAYSLIP_COLUMNS, type PayslipRecord } from "@/app/payslip";
import { PrintButton } from "@/app/print-button";

export default async function SalaryHistoryPrintPage({ searchParams }: PageProps<"/admin/salary-history/print">) {
  await requireAdmin();
  const { id, staff, year } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("salary_records")
    .select(`${PAYSLIP_COLUMNS}, staff_id, staff:staff_id(department_name)`)
    .eq("status", "confirmed")
    .order("month");
  if (typeof id === "string") query = query.eq("id", id);
  else if (typeof staff === "string" && typeof year === "string") query = query.eq("staff_id", staff).eq("year", Number(year));
  else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data } = await query;
  const slips = (data ?? []) as unknown as (PayslipRecord & { staff_id: string; staff: { department_name: string | null } | null })[];
  const backStaff = slips[0]?.staff_id;

  return (
    <div className="space-y-6">
      <div className="no-print mx-auto flex max-w-[180mm] flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/salary-history${backStaff ? `?staff=${backStaff}` : ""}`} className="text-sm text-slate-500 hover:text-slate-800">
            ← 給与履歴
          </Link>
          <p className="mt-1 text-sm text-slate-600">{slips.length}か月分（1か月1ページ）</p>
        </div>
        {slips.length > 0 && <PrintButton />}
      </div>
      {slips.length === 0 && <p className="text-center text-sm text-slate-400">確定済みの明細が見つかりません</p>}
      {slips.map((s) => (
        <div key={s.id} className="break-after-page rounded-xl bg-white p-[10mm] shadow-sm last:break-after-auto print:rounded-none print:p-0 print:shadow-none">
          <Payslip r={s} department={s.staff?.department_name} />
        </div>
      ))}
    </div>
  );
}
