import "server-only";
import { pushLine } from "@/lib/line-push";
import { createAdminClient } from "@/lib/supabase/admin";

/** 取引先（銀行）に見せるもの（本部が選んだ書類と、売上を見せる会社） */
export async function sharesOf(partnerId: string) {
  const { data } = await createAdminClient().from("partner_shares").select("kind, file_id, company_id").eq("partner_id", partnerId);
  return {
    fileIds: (data ?? []).filter((s) => s.kind === "file" && s.file_id).map((s) => s.file_id as string),
    companyIds: (data ?? []).filter((s) => s.kind === "sales" && s.company_id).map((s) => s.company_id as string),
  };
}

export type MonthlyRow = { month: string; byStore: Record<string, { sales: number; people: number }>; total: { sales: number; people: number } };

/** 会社の月ごとの売上・客数（店ごとと合計。直近24か月・税込）。個人の情報は含めない */
export async function monthlySales(companyId: string, months = 24): Promise<{ stores: { id: string; name: string }[]; rows: MonthlyRow[] }> {
  const admin = createAdminClient();
  const { data: stores } = await admin.from("stores").select("id, name").eq("company_id", companyId).order("sort_order", { nullsFirst: false });
  const ids = (stores ?? []).map((s) => s.id);
  if (!ids.length) return { stores: [], rows: [] };
  const now = new Date(Date.now() + 9 * 3_600_000);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString().slice(0, 10);
  const { data } = await admin.from("pos_daily").select("store_id, business_date, sales, people").in("store_id", ids).gte("business_date", from).limit(50000);
  const map = new Map<string, MonthlyRow>();
  for (const d of data ?? []) {
    const m = d.business_date.slice(0, 7);
    const row: MonthlyRow = map.get(m) ?? { month: m, byStore: {}, total: { sales: 0, people: 0 } };
    const cell = row.byStore[d.store_id] ?? { sales: 0, people: 0 };
    cell.sales += Number(d.sales);
    cell.people += Number(d.people);
    row.byStore[d.store_id] = cell;
    row.total.sales += Number(d.sales);
    row.total.people += Number(d.people);
    map.set(m, row);
  }
  const used = new Set([...map.values()].flatMap((r) => Object.keys(r.byStore)));
  return { stores: (stores ?? []).filter((s) => used.has(s.id)), rows: [...map.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}

/** 代表の LINE に知らせる（銀行の人がログインした・書類を開いた・書類を入れた） */
export async function notifyCeo(text: string) {
  const id = process.env.CEO_STAFF_ID;
  if (!id) return;
  const { data } = await createAdminClient().from("staff").select("line_user_id").eq("id", id).maybeSingle();
  if (data?.line_user_id) await pushLine([data.line_user_id], text, "report");
}
