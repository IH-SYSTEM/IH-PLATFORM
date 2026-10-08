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
