import { yen } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/staff";
import { ALLOWANCE_FIELDS, ATTENDANCE_FIELDS, DEDUCTION_FIELDS, PAYMENT_BASE_FIELDS, type EmploymentType } from "@/lib/payroll/record";

export type PayslipRecord = {
  id: string;
  staff_name: string | null;
  year: number;
  month: number;
  employment_type: EmploymentType;
  attendance: Record<string, number>;
  payment: Record<string, number>;
  deduction: Record<string, number>;
  total_payment: number;
  total_deduction: number;
  net_payment: number;
  memo: string | null;
};

export const PAYSLIP_COLUMNS =
  "id, staff_name, year, month, employment_type, attendance, payment, deduction, total_payment, total_deduction, net_payment, memo";

function Lines({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-1.5">
          <dt className="text-slate-600">{k}</dt>
          <dd className="tabular-nums text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({ title, tone, children, total }: { title: string; tone: string; children: React.ReactNode; total?: [string, string] }) {
  return (
    <section className="break-inside-avoid">
      <h3 className={`rounded-md px-2.5 py-1 text-xs font-bold print:[-webkit-print-color-adjust:exact] ${tone}`}>{title}</h3>
      <div className="px-1">{children}</div>
      {total && (
        <div className="mt-1 flex justify-between border-t-2 border-slate-300 px-1 pt-1.5 text-sm font-bold">
          <span>{total[0]}</span>
          <span className="tabular-nums">{total[1]}</span>
        </div>
      )}
    </section>
  );
}

export function Payslip({ r, department }: { r: PayslipRecord; department?: string | null }) {
  const a = r.attendance ?? {};
  const p = r.payment ?? {};
  const d = r.deduction ?? {};
  const attendance: [string, string][] = ATTENDANCE_FIELDS.map((f) => [f.label, `${a[f.key] ?? 0}${f.unit}`]);
  if (r.employment_type === "hourly") {
    attendance.push(["時給", yen(a.hourlyWage)], ["勤務時間", `${a.workHours ?? 0}時間`]);
  }
  const base = PAYMENT_BASE_FIELDS[r.employment_type];
  const payment: [string, string][] = [];
  if (base) payment.push([base.label, yen(p[base.key])]);
  if (r.employment_type === "daily") payment.push(["日給 × 出勤日数", yen((p.dailyWage || 0) * (a.workDays || 0))]);
  if (r.employment_type === "hourly") payment.push(["時給 × 勤務時間", yen(Number(r.total_payment) - ALLOWANCE_FIELDS.reduce((s, f) => s + (p[f.key] || 0), 0))]);
  for (const f of ALLOWANCE_FIELDS) if (p[f.key]) payment.push([f.label, yen(p[f.key])]);
  const deduction: [string, string][] = DEDUCTION_FIELDS.filter((f) => d[f.key]).map((f) => [f.label, yen(d[f.key])]);

  return (
    <article className="mx-auto max-w-[180mm] bg-white text-slate-900">
      <header className="flex items-end justify-between border-b-2 border-slate-800 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-[0.3em]">給与明細書</h2>
          <p className="mt-1 text-sm text-slate-600">
            {r.year}年{r.month}月分 ・ {EMPLOYMENT_TYPES.find((e) => e.value === r.employment_type)?.label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{r.staff_name} 様</p>
          {department && <p className="text-xs text-slate-500">{department}</p>}
        </div>
      </header>

      <div className="mt-4 grid gap-5 sm:grid-cols-3 print:grid-cols-3">
        <Block title="勤怠" tone="bg-slate-100 text-slate-700">
          <Lines rows={attendance} />
        </Block>
        <Block title="支給" tone="bg-emerald-50 text-emerald-800" total={["総支給額", yen(r.total_payment)]}>
          <Lines rows={payment} />
        </Block>
        <Block title="控除" tone="bg-rose-50 text-rose-800" total={["控除合計", yen(r.total_deduction)]}>
          {deduction.length ? <Lines rows={deduction} /> : <p className="py-1.5 text-sm text-slate-400">控除はありません</p>}
        </Block>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white print:[-webkit-print-color-adjust:exact]">
        <span className="text-sm font-semibold">差引支給額</span>
        <span className="text-2xl font-bold tabular-nums">{yen(r.net_payment)}</span>
      </div>

      {r.memo && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">備考：</span>
          {r.memo}
        </p>
      )}
    </article>
  );
}
