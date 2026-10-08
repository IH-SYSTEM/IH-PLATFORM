import Link from "next/link";
import { businessDayJST } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";

export const metadata = { title: "売上" };

type Day = { store_id: string; business_date: string; sales: number; people: number; receipts: number };

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const shift = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// 店舗別・日別の売上（データ取り込みで入れたレジのデータ）。客単価＝売上÷客数
export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const today = businessDayJST();
  const { month: m } = await searchParams;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const from = `${month}-01`;
  const to = `${shift(month, 1)}-01`;

  const admin = createAdminClient();
  const [{ data: stores }, { data: days }, { data: latest }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_daily").select("store_id, business_date, sales, people, receipts").gte("business_date", from).lt("business_date", to).limit(5000),
    admin.from("pos_daily").select("store_id, business_date").order("business_date", { ascending: false }).limit(3000),
  ]);
  const rows = (days ?? []) as Day[];
  const lastDate = new Map<string, string>();
  for (const r of latest ?? []) if (!lastDate.has(r.store_id)) lastDate.set(r.store_id, r.business_date);

  const withData = (stores ?? []).filter((s) => rows.some((r) => r.store_id === s.id));
  const without = (stores ?? []).filter((s) => !withData.includes(s));
  const cell = new Map(rows.map((r) => [`${r.store_id}:${r.business_date}`, r]));
  const dates = [...new Set(rows.map((r) => r.business_date))].sort();
  const sum = (list: Day[]) => ({ sales: list.reduce((s, r) => s + Number(r.sales), 0), people: list.reduce((s, r) => s + Number(r.people), 0), days: list.length });
  const stale = (id: string) => month === today.slice(0, 7) && lastDate.has(id) && Date.parse(today) - Date.parse(lastDate.get(id)!) > 7 * 86_400_000;

  return (
    <div className="space-y-6">
      <PageHeader
        title="売上"
        description="レジのデータから、店舗別・日別に出しています（6:00 区切りの営業日）"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`?month=${shift(month, -1)}`} className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">
              ‹ 前月
            </Link>
            <span className="px-2 font-bold tabular-nums">{month.replace("-", "年")}月</span>
            <Link href={`?month=${shift(month, 1)}`} className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">
              翌月 ›
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {withData.map((s) => {
          const t = sum(rows.filter((r) => r.store_id === s.id));
          return (
            <div key={s.id} className={`rounded-md border bg-white p-5 ${stale(s.id) ? "border-accent/40 border-l-4 border-l-accent" : "border-line"}`}>
              <p className="text-xs font-bold text-slate-500">{s.name}</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{yen(t.sales)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-slate-400">客数</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{t.people.toLocaleString()}人</dd>
                </div>
                <div>
                  <dt className="text-slate-400">客単価</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{t.people ? yen(t.sales / t.people) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">1日平均</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{yen(t.sales / t.days)}</dd>
                </div>
              </dl>
              <p className={`mt-3 text-[11px] ${stale(s.id) ? "font-bold text-accent" : "text-slate-400"}`}>
                {lastDate.get(s.id) ? `データは ${Number(lastDate.get(s.id)!.slice(5, 7))}/${Number(lastDate.get(s.id)!.slice(8, 10))} まで` : ""}
                {stale(s.id) ? "（1週間以上取り込まれていません）" : ""}
              </p>
            </div>
          );
        })}
        {!withData.length && <p className="rounded-md border border-line bg-white p-6 text-sm text-slate-400 sm:col-span-2 xl:col-span-3">この月のデータはまだありません。「データ取り込み」からレジのCSVを入れてください。</p>}
      </div>

      {dates.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">日別</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left font-medium">日付</th>
                  {withData.map((s) => (
                    <th key={s.id} className="px-4 py-2.5 text-right font-medium">
                      {s.name}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dates.map((d) => {
                  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                  const total = sum(withData.map((s) => cell.get(`${s.id}:${d}`)).filter((x): x is Day => !!x));
                  return (
                    <tr key={d}>
                      <td className={`sticky left-0 bg-white px-4 py-2 tabular-nums ${dow === 0 ? "text-accent" : dow === 6 ? "text-brand" : "text-slate-700"}`}>
                        {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}（{"日月火水木金土"[dow]}）
                      </td>
                      {withData.map((s) => {
                        const c = cell.get(`${s.id}:${d}`);
                        return (
                          <td key={s.id} className="px-4 py-2 text-right tabular-nums">
                            {c ? (
                              <>
                                <span className="font-bold text-slate-900">{yen(Number(c.sales))}</span>
                                <span className="ml-2 text-xs text-slate-400">
                                  {c.people}人・{c.people ? yen(Number(c.sales) / Number(c.people)) : "—"}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">{yen(total.sales)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {without.length > 0 && <p className="text-xs text-slate-400">まだデータがない店舗：{without.map((s) => s.name).join("・")}</p>}
    </div>
  );
}
