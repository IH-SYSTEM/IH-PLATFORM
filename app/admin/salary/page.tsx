import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { yen } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/staff";
import { parsePeriod, periodLabel, shiftPeriod, ym } from "@/lib/payroll/period";

const typeLabel = (t: string | null | undefined) => EMPLOYMENT_TYPES.find((e) => e.value === t)?.label ?? "未設定";

export default async function SalaryMonthPage({ searchParams }: PageProps<"/admin/salary">) {
  await requireAdmin();
  const params = await searchParams;
  const period = parsePeriod(params.ym);
  const supabase = await createClient();

  const [{ data: staff }, { data: records }] = await Promise.all([
    supabase.from("staff").select("id, name, furigana, retired, department_name, payroll_master").order("furigana", { nullsFirst: false }),
    supabase
      .from("salary_records")
      .select("id, staff_id, employment_type, status, total_payment, total_deduction, net_payment, updated_at")
      .eq("year", period.year)
      .eq("month", period.month)
      .order("updated_at", { ascending: false }),
  ]);

  const recordByStaff = new Map<string, NonNullable<typeof records>[number]>();
  for (const r of records ?? []) if (!recordByStaff.has(r.staff_id)) recordByStaff.set(r.staff_id, r);

  const rows = (staff ?? [])
    .filter((s) => !s.retired || recordByStaff.has(s.id))
    .map((s) => ({ ...s, record: recordByStaff.get(s.id) ?? null }));
  const order = (r: (typeof rows)[number]) => (!r.record ? 0 : r.record.status === "draft" ? 1 : 2);
  rows.sort((a, b) => order(a) - order(b));

  const confirmed = rows.filter((r) => r.record?.status === "confirmed");
  const drafts = rows.filter((r) => r.record?.status === "draft");
  const missing = rows.filter((r) => !r.record);
  const sum = (key: "total_payment" | "net_payment") => confirmed.reduce((s, r) => s + Number(r.record![key]), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">給与入力</h1>
          <p className="mt-1 text-sm text-slate-500">スタッフを選んで勤怠・支給・控除を入力し、確定します</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <Link href={`/admin/salary?ym=${ym(shiftPeriod(period, -1))}`} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100" aria-label="前の月">
            ‹
          </Link>
          <span className="min-w-28 text-center text-sm font-semibold text-slate-900">{periodLabel(period)}分</span>
          <Link href={`/admin/salary?ym=${ym(shiftPeriod(period, 1))}`} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100" aria-label="次の月">
            ›
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["確定", `${confirmed.length}名`, "text-emerald-700"],
          ["下書き", `${drafts.length}名`, drafts.length ? "text-amber-600" : "text-slate-900"],
          ["未入力", `${missing.length}名`, missing.length ? "text-rose-600" : "text-slate-900"],
          ["差引支給 合計（確定分）", yen(sum("net_payment")), "text-slate-900"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">所属</th>
              <th className="px-4 py-3 font-medium">給与形態</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 text-right font-medium">総支給</th>
              <th className="px-4 py-3 text-right font-medium">控除</th>
              <th className="px-4 py-3 text-right font-medium">差引支給</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.name}
                  {r.retired && <span className="ml-2 text-xs text-slate-400">退職</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.department_name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {typeLabel(r.record?.employment_type ?? (r.payroll_master as { employmentType?: string } | null)?.employmentType)}
                </td>
                <td className="px-4 py-3">
                  {!r.record ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">未入力</span>
                  ) : r.record.status === "draft" ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">下書き</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">確定</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.record ? yen(r.record.total_payment) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.record ? yen(r.record.total_deduction) : "—"}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{r.record ? yen(r.record.net_payment) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/salary/${r.id}?ym=${ym(period)}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                  >
                    {r.record ? "編集" : "入力"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
