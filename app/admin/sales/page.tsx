import Link from "next/link";
import { businessDayJST } from "@/lib/business-day";
import { laborByStoreDay } from "@/lib/labor-cost";
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
  const [{ data: stores }, { data: days }, { data: latest }, { data: bySource }] = await Promise.all([
    admin.from("stores").select("id, name, sales_source").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_daily").select("store_id, business_date, sales, people, receipts").gte("business_date", from).lt("business_date", to).limit(5000),
    admin.from("pos_daily").select("store_id, business_date").order("business_date", { ascending: false }).limit(3000),
    admin.from("pos_daily_by_source").select("store_id, business_date, source, sales").gte("business_date", from).lt("business_date", to).limit(5000),
  ]);
  // 突き合わせ：基準（CRM）と、レジ（エアレジなど）の両方がある日に、金額がずれている日
  const SOURCE_LABEL: Record<string, string> = { airregi: "エアレジ", ikkou: "一鴻レジ", crm: "CRM" };
  const mismatches = (stores ?? []).flatMap((s) => {
    if (!s.sales_source) return [];
    const mine = (bySource ?? []).filter((r) => r.store_id === s.id);
    return [...new Set(mine.map((r) => r.business_date))].sort().flatMap((d) => {
      const base = mine.find((r) => r.business_date === d && r.source === s.sales_source);
      return mine
        .filter((r) => r.business_date === d && r.source !== s.sales_source)
        .map((other) => ({ store: s.name, date: d, baseLabel: SOURCE_LABEL[s.sales_source!] ?? s.sales_source!, base: Number(base?.sales ?? 0), otherLabel: SOURCE_LABEL[other.source] ?? other.source, other: Number(other.sales) }));
    });
  });
  const checkedDays = mismatches.length;
  const diffs = mismatches.filter((m) => m.base !== m.other);
  const rows = (days ?? []) as Day[];
  // 人件費（見込み）：勤怠×その日の時給、月給は暦日で割って所属店へ。今日までの分だけ
  const lastDay = new Date(Date.parse(`${to}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const labor = from <= today ? await laborByStoreDay(from, lastDay < today ? lastDay : today) : new Map();
  const rate = (cost: number, sales: number) => (sales > 0 ? `${Math.round((cost / sales) * 1000) / 10}%` : "—");
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
          // 人件費率は、その店に勤怠の記録がある日だけで出す（勤怠のない日の売上は分母に入れない）
          const laborDays = rows.filter((r) => r.store_id === s.id && labor.get(`${s.id}:${r.business_date}`)?.hasAttendance);
          const laborCost = laborDays.reduce((a, r) => a + (labor.get(`${s.id}:${r.business_date}`)?.cost ?? 0), 0);
          const laborSales = laborDays.reduce((a, r) => a + Number(r.sales), 0);
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
              <div className="mt-3 flex items-baseline justify-between rounded bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-500">
                  人件費率{laborDays.length ? `（勤怠のある${laborDays.length}日）` : ""}
                </span>
                {laborDays.length ? (
                  <span className="tabular-nums">
                    <b className="text-base text-slate-900">{rate(laborCost, laborSales)}</b>
                    <span className="ml-2 text-slate-500">{yen(laborCost)}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">勤怠の記録なし</span>
                )}
              </div>
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
                                  {labor.get(`${s.id}:${d}`)?.hasAttendance && <>・人件費率 {rate(labor.get(`${s.id}:${d}`)!.cost, Number(c.sales))}</>}
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

      {checkedDays > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">レジとの突き合わせ</h2>
          {diffs.length ? (
            <div className="overflow-hidden rounded-md border border-accent/30 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-accent-soft/50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">日付</th>
                    <th className="px-4 py-2 font-medium">店舗</th>
                    <th className="px-4 py-2 text-right font-medium">基準</th>
                    <th className="px-4 py-2 text-right font-medium">レジ</th>
                    <th className="px-4 py-2 text-right font-medium">差</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diffs.map((m) => (
                    <tr key={`${m.store}:${m.date}:${m.otherLabel}`}>
                      <td className="px-4 py-2 tabular-nums">
                        {Number(m.date.slice(5, 7))}/{Number(m.date.slice(8, 10))}
                      </td>
                      <td className="px-4 py-2">{m.store}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {m.baseLabel} {yen(m.base)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {m.otherLabel} {yen(m.other)}
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-accent">{yen(m.other - m.base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">売上は基準（CRM）で数えています。ずれた日は、施術の記録とレジの会計のどちらかに入力漏れ・修正漏れがないか確かめてください</p>
            </div>
          ) : (
            <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-emerald-700">レジと突き合わせた {checkedDays} 日分は、すべて金額が合っています</p>
          )}
        </section>
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        人件費は見込みです：時給・日給の人は勤怠（打刻した店）とその日の時給から、月給の人は月給と固定の手当を暦日で割って所属店に入れています。会社負担の社会保険料は含みません。役員は除いています。
      </p>

      {without.length > 0 && <p className="text-xs text-slate-400">まだデータがない店舗：{without.map((s) => s.name).join("・")}</p>}
    </div>
  );
}
