import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { yen } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/staff";

export default async function SalaryHistoryPage({ searchParams }: PageProps<"/admin/salary-history">) {
  await requireAdmin();
  const { staff: staffParam } = await searchParams;
  const staffId = typeof staffParam === "string" ? staffParam : "";
  const supabase = await createClient();

  const [{ data: staff }, { data: records }] = await Promise.all([
    supabase.from("staff").select("id, name, retired").order("retired").order("furigana", { nullsFirst: false }),
    staffId
      ? supabase
          .from("salary_records")
          .select("id, year, month, employment_type, total_payment, total_deduction, net_payment")
          .eq("staff_id", staffId)
          .eq("status", "confirmed")
          .order("year", { ascending: false })
          .order("month", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const selected = (staff ?? []).find((s) => s.id === staffId);
  const years = [...new Set((records ?? []).map((r) => r.year))];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">給与履歴出力</h1>
        <p className="mt-1 text-sm text-slate-500">確定済みの給与明細を、1か月ずつまたは1年分まとめて印刷・PDF保存できます</p>
      </div>

      <form className="flex flex-wrap gap-2">
        <select name="staff" defaultValue={staffId} className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">スタッフを選択</option>
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.retired ? "（退職）" : ""}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">表示する</button>
      </form>

      {selected && years.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
          {selected.name} さんの確定済み給与はありません
        </p>
      )}

      {years.map((year) => {
        const rows = (records ?? []).filter((r) => r.year === year);
        const sum = (k: "total_payment" | "total_deduction" | "net_payment") => rows.reduce((s, r) => s + Number(r[k]), 0);
        return (
          <section key={year} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold text-slate-900">{year}年</h2>
              <Link
                href={`/admin/salary-history/print?staff=${staffId}&year=${year}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
              >
                {year}年分をまとめて出力
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">対象月</th>
                  <th className="px-5 py-2.5 font-medium">給与形態</th>
                  <th className="px-5 py-2.5 text-right font-medium">総支給</th>
                  <th className="px-5 py-2.5 text-right font-medium">控除</th>
                  <th className="px-5 py-2.5 text-right font-medium">差引支給</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 font-medium">{r.month}月分</td>
                    <td className="px-5 py-2.5 text-slate-600">{EMPLOYMENT_TYPES.find((e) => e.value === r.employment_type)?.label ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{yen(r.total_payment)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{yen(r.total_deduction)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{yen(r.net_payment)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/admin/salary-history/print?id=${r.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
                        明細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-5 py-2.5" colSpan={2}>
                    {year}年 合計（{rows.length}か月）
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{yen(sum("total_payment"))}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{yen(sum("total_deduction"))}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{yen(sum("net_payment"))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
    </div>
  );
}
