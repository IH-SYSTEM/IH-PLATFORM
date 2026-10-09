import "server-only";
import { businessDayJST } from "@/lib/business-day";
import { laborByStoreDay } from "@/lib/labor-cost";
import { createAdminClient } from "@/lib/supabase/admin";

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const pct = (cost: number, sales: number) => (sales > 0 ? `${Math.round((cost / sales) * 1000) / 10}%` : "—");
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T12:00:00Z`).getUTCDay()]}）`;

export type StoreReport = { storeId: string; storeName: string; to: string[]; names: string[]; text: string };

/**
 * 店長に送る「昨日の売上・人件費・人件費率」と「今月の累計」。
 * 店長＝店舗マスタで店長に選ばれた人＋権限が「店長」でその店に所属する人。LINE連携済みの人だけに送る
 */
export async function buildLaborReports({ preview = false }: { preview?: boolean } = {}): Promise<StoreReport[]> {
  const admin = createAdminClient();
  const day = new Date(Date.parse(`${businessDayJST()}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10); // 昨日（営業日）
  const monthFrom = `${day.slice(0, 7)}-01`;
  const [{ data: stores }, { data: staff }, { data: sales }, labor] = await Promise.all([
    admin.from("stores").select("id, name, manager_staff_ids, target_labor_cost_rate, sales_source").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("staff").select("id, name, store_id, permission, line_user_id, retired"),
    admin.from("pos_daily").select("store_id, business_date, sales, people").gte("business_date", monthFrom).lte("business_date", day).limit(10000),
    laborByStoreDay(monthFrom, day),
  ]);

  const out: StoreReport[] = [];
  for (const s of stores ?? []) {
    const managerIds = new Set([...((s.manager_staff_ids as string[]) ?? []), ...(staff ?? []).filter((p) => p.permission === "store" && p.store_id === s.id).map((p) => p.id)]);
    const managers = (staff ?? []).filter((p) => managerIds.has(p.id) && !p.retired && ((p.line_user_id && !p.line_user_id.startsWith("TEST-")) || preview));
    const mine = (sales ?? []).filter((r) => r.store_id === s.id);
    if (!managers.length || !mine.length) continue; // 店長がLINE未連携、または売上のデータがない店は送らない（preview は未連携でも中身を作る）

    const y = mine.find((r) => r.business_date === day);
    const yLabor = labor.get(`${s.id}:${day}`);
    const target = s.target_labor_cost_rate ? `（目標 ${Math.round(Number(s.target_labor_cost_rate) * 100)}%）` : "";
    // 今月の累計は、勤怠の記録がある日だけで比べる
    const days = mine.filter((r) => labor.get(`${s.id}:${r.business_date}`)?.hasAttendance);
    const mSales = days.reduce((a, r) => a + Number(r.sales), 0);
    const mCost = days.reduce((a, r) => a + (labor.get(`${s.id}:${r.business_date}`)?.cost ?? 0), 0);
    const lastData = mine.map((r) => r.business_date).sort().at(-1)!;

    const lines = [`【${s.name}】${md(day)}の数字`];
    if (y) {
      lines.push(`売上　　${yen(Number(y.sales))}（${y.people}人・客単価 ${yen(Number(y.sales) / Math.max(1, Number(y.people)))}）`);
      if (yLabor?.hasAttendance) lines.push(`人件費　${yen(yLabor.cost)}`, `人件費率 ${pct(yLabor.cost, Number(y.sales))}${target}`);
      else lines.push("人件費　勤怠の記録がありません");
    } else {
      lines.push(`売上のデータがまだ入っていません（${md(lastData)}まで）`);
    }
    lines.push("", `── 今月（${Number(monthFrom.slice(5, 7))}/1〜）`);
    if (days.length) lines.push(`売上 ${yen(mSales)}／人件費 ${yen(mCost)}`, `人件費率 ${pct(mCost, mSales)}${target}（${days.length}日分）`);
    else lines.push("勤怠の記録がある日がまだありません");
    lines.push("", "くわしくは IH ポータル → 売上");
    out.push({ storeId: s.id, storeName: s.name, to: managers.map((m) => m.line_user_id).filter((v): v is string => !!v && !v.startsWith("TEST-")), names: managers.map((m) => m.name), text: lines.join("\n") });
  }
  return out;
}

/**
 * 代表に送る「全店まとめ」（2026-10-10 黒田さん要望）。昨日と今月の、店ごとの売上・人件費率と目標、全店の合計。
 * 人件費率は勤怠の記録がある日だけで出す。売上のデータがまだ入っていない店はそう書く
 */
export async function buildCeoSummary(): Promise<{ to: string | null; text: string }> {
  const admin = createAdminClient();
  const day = new Date(Date.parse(`${businessDayJST()}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const monthFrom = `${day.slice(0, 7)}-01`;
  const ceoId = process.env.CEO_STAFF_ID ?? "";
  const [{ data: stores }, { data: sales }, { data: ceo }, labor] = await Promise.all([
    admin.from("stores").select("id, name, target_labor_cost_rate").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_daily").select("store_id, business_date, sales, people").gte("business_date", monthFrom).lte("business_date", day).limit(10000),
    admin.from("staff").select("line_user_id").eq("id", ceoId).maybeSingle(),
    laborByStoreDay(monthFrom, day),
  ]);
  const short = (name: string) => name.replace("縮毛矯正＆髪質改善", "").replace(/\s|　/g, "");
  const yLines: string[] = [];
  const mLines: string[] = [];
  const tot = { ys: 0, yc: 0, ms: 0, mc: 0 };
  for (const s of stores ?? []) {
    const mine = (sales ?? []).filter((r) => r.store_id === s.id);
    if (!mine.length) continue; // 売上を集めていない店（本部など）は出さない
    const target = s.target_labor_cost_rate ? Number(s.target_labor_cost_rate) : null;
    const mark = (cost: number, sale: number) => (target && sale > 0 && cost / sale > target ? "（目標超え）" : "");
    const tgt = target ? `／目標${Math.round(target * 100)}%` : "";
    const y = mine.find((r) => r.business_date === day);
    const yl = labor.get(`${s.id}:${day}`);
    if (y) {
      const rate = yl?.hasAttendance ? `人件費率 ${pct(yl.cost, Number(y.sales))}${tgt}${mark(yl.cost, Number(y.sales))}` : "人件費 勤怠なし";
      yLines.push(`${short(s.name)}　${yen(Number(y.sales))}（${y.people}人）${rate}`);
      tot.ys += Number(y.sales);
      if (yl?.hasAttendance) tot.yc += yl.cost;
    } else {
      yLines.push(`${short(s.name)}　売上データ未取込（${md(mine.map((r) => r.business_date).sort().at(-1)!)}まで）`);
    }
    const days = mine.filter((r) => labor.get(`${s.id}:${r.business_date}`)?.hasAttendance);
    const mSales = mine.reduce((a, r) => a + Number(r.sales), 0);
    const lSales = days.reduce((a, r) => a + Number(r.sales), 0);
    const lCost = days.reduce((a, r) => a + (labor.get(`${s.id}:${r.business_date}`)?.cost ?? 0), 0);
    mLines.push(`${short(s.name)}　${yen(mSales)}${days.length ? `／人件費率 ${pct(lCost, lSales)}${tgt}${mark(lCost, lSales)}` : ""}`);
    tot.ms += mSales;
    tot.mc += lCost;
  }
  const text = [
    `【全店まとめ】${md(day)}`,
    "",
    "■ 昨日",
    ...(yLines.length ? yLines : ["売上のデータがありません"]),
    `全店　売上 ${yen(tot.ys)}／人件費 ${yen(tot.yc)}`,
    "",
    `■ 今月（${Number(monthFrom.slice(5, 7))}/1〜）`,
    ...mLines,
    `全店　売上 ${yen(tot.ms)}／人件費 ${yen(tot.mc)}（勤怠のある日の分）`,
    "",
    "くわしくは IH ポータル → 売上",
  ].join("\n");
  return { to: ceo?.line_user_id ?? null, text };
}
