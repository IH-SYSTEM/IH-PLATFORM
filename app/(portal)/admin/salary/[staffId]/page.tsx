import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod, periodLabel, shiftPeriod, ym } from "@/lib/payroll/period";
import type { Master } from "@/lib/payroll/calculator";
import { SalaryForm, type ExistingRecord } from "../salary-form";
import { saveSalary } from "../actions";

export default async function SalaryEditPage({ params, searchParams }: PageProps<"/admin/salary/[staffId]">) {
  await requireAdmin();
  const { staffId } = await params;
  const period = parsePeriod((await searchParams).ym);
  const supabase = await createClient();

  const [{ data: staff }, { data: record }] = await Promise.all([
    supabase.from("staff").select("id, name, department_name, payroll_master").eq("id", staffId).maybeSingle(),
    supabase
      .from("salary_records")
      .select("employment_type, attendance, payment, deduction, memo, status, updated_at")
      .eq("staff_id", staffId)
      .eq("year", period.year)
      .eq("month", period.month)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<ExistingRecord>(),
  ]);
  if (!staff) notFound();

  const master = staff.payroll_master as (Master & { incomeTaxColumn?: string }) | null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/salary?ym=${ym(period)}`} className="text-sm text-slate-500 hover:text-slate-800">
            ← {periodLabel(period)}分の一覧
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {staff.name}
            <span className="ml-3 text-base font-medium text-slate-500">{periodLabel(period)}分</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">{staff.department_name ?? "未所属"}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/admin/salary/${staff.id}?ym=${ym(shiftPeriod(period, -1))}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50">
            ‹ 前月
          </Link>
          <Link href={`/admin/salary/${staff.id}?ym=${ym(shiftPeriod(period, 1))}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50">
            翌月 ›
          </Link>
        </div>
      </div>

      <SalaryForm
        key={`${staff.id}-${ym(period)}`}
        staffId={staff.id}
        master={master}
        incomeTaxColumn={master?.incomeTaxColumn ?? null}
        record={record}
        action={saveSalary.bind(null, staff.id, period.year, period.month)}
      />
    </div>
  );
}
