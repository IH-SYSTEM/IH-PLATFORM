import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { toJSTDateString } from "@/lib/business-day";
import { costOf, sheetRows, stockValue, type CalcItem, type PurchaseLine } from "@/lib/inventory-calc";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 棚卸しシステム（2026-10-20）。lib/inventory-calc.ts が計算、ここは読み書きと権限。
 *   使える人：本部（経理・総務の担当と代表）＝全店。店長（その店を見られる人）＝「棚卸しシステムを使う」にした店だけ
 *   納品伝票の取り込み・確認は経理の担当だけ
 */
export const STOCK_ACCOUNTS = ["材料仕入", "酒類仕入"]; // 店のレシートのうち、仕入れとして数える勘定科目
export const CATEGORIES = ["食材", "酒", "飲料", "調味料", "冷凍品", "乾物", "消耗品", "その他"] as const;

export const todayJST = () => toJSTDateString(new Date());
const isHQ = (me: CurrentStaff) => me.isAdmin && me.duties.some((d) => ["keiri_input", "keiri_approve", "soumu"].includes(d));
export const canUseSlips = (me: CurrentStaff) => me.isAdmin && me.duties.some((d) => d === "keiri_input" || d === "keiri_approve");

/** 棚卸しを使える店（本部は使っている店すべて＝オープン前も。店長は、オープンした担当の店） */
export async function inventoryStores(me: CurrentStaff): Promise<{ id: string; name: string; enabled: boolean; target: number | null }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("stores").select("id, name, inventory_enabled, target_food_cost_rate").eq("is_active", true).order("sort_order", { nullsFirst: false });
  const all = (data ?? []).map((s) => ({ id: s.id, name: s.name, enabled: s.inventory_enabled, target: s.target_food_cost_rate === null ? null : Number(s.target_food_cost_rate) }));
  if (isHQ(me)) return all;
  const scope = await attendanceScope(me);
  if (!scope) return [];
  return all.filter((s) => s.enabled && (scope.all || scope.storeIds.includes(s.id)));
}

/** 今の期間（なければ、今日から始める） */
export async function openPeriod(storeId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("inventory_periods").select("id, start_date").eq("store_id", storeId).is("end_date", null).maybeSingle();
  if (data) return data;
  const { data: made } = await admin.from("inventory_periods").insert({ store_id: storeId, start_date: todayJST() }).select("id, start_date").single();
  return made!;
}

/** 期間の仕入れ（納品伝票の行＋レシートの仕入れ）。to は含む */
export async function purchasesIn(storeId: string, from: string, to: string) {
  const admin = createAdminClient();
  const [{ data: slips }, { data: receipts }] = await Promise.all([
    admin.from("delivery_slips").select("id, delivery_slip_lines(item_id, qty, amount)").eq("store_id", storeId).eq("status", "approved").gte("slip_date", from).lte("slip_date", to),
    admin.from("expenses").select("expense_lines(account_title, amount)").eq("store_id", storeId).eq("status", "approved").gte("expense_date", from).lte("expense_date", to),
  ]);
  const lines: PurchaseLine[] = (slips ?? []).flatMap((s) => s.delivery_slip_lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), amount: l.amount })));
  const slipTotal = lines.reduce((a, l) => a + l.amount, 0);
  const receiptTotal = (receipts ?? []).flatMap((e) => e.expense_lines).filter((l) => l.account_title && STOCK_ACCOUNTS.includes(l.account_title)).reduce((a, l) => a + l.amount, 0);
  return { lines, slipTotal, receiptTotal, total: slipTotal + receiptTotal, slipCount: (slips ?? []).length };
}

export async function storeItems(storeId: string): Promise<(CalcItem & { aliases: string[]; active: boolean })[]> {
  const { data } = await createAdminClient().from("inventory_items").select("id, name, category, count_unit, per_purchase, unit_cost, track, aliases, active").eq("store_id", storeId).order("name");
  return (data ?? []).map((i) => ({ ...i, per_purchase: Number(i.per_purchase), unit_cost: i.unit_cost === null ? null : Number(i.unit_cost) }));
}

/** 店の今：期間・期首の在庫・仕入れ・最後の棚卸し・原価の目安（最後の棚卸しの日まで） */
export async function inventoryStatus(storeId: string) {
  const admin = createAdminClient();
  const period = await openPeriod(storeId);
  const today = todayJST();
  const [{ data: opening }, { data: lastCount }, items, buys] = await Promise.all([
    admin.from("inventory_opening").select("item_id, qty, unit_cost").eq("period_id", period.id),
    admin.from("inventory_counts").select("id, counted_on, value, created_at").eq("period_id", period.id).order("counted_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    storeItems(storeId),
    purchasesIn(storeId, period.start_date, today),
  ]);
  const open = (opening ?? []).map((o) => ({ item_id: o.item_id, qty: Number(o.qty), unit_cost: o.unit_cost === null ? null : Number(o.unit_cost) }));
  const openingValue = stockValue(open);
  // 原価の目安：最後に数えた日まで（数えていなければ今日まで、在庫は期首のまま＝買った分はすべて原価、と見なさない）
  const until = lastCount?.counted_on ?? null;
  const buysUntil = until ? await purchasesIn(storeId, period.start_date, until) : null;
  const { data: sales } = until ? await admin.from("pos_daily").select("sales").eq("store_id", storeId).gte("business_date", period.start_date).lte("business_date", until) : { data: [] };
  const salesTotal = (sales ?? []).reduce((a, s) => a + Number(s.sales ?? 0), 0);
  const cost = until && buysUntil ? costOf({ openingValue, purchases: buysUntil.total, stockNow: lastCount!.value, sales: salesTotal }) : null;
  return {
    period,
    opening: open,
    openingValue,
    items,
    purchases: buys,
    rows: sheetRows(items, open, buys.lines),
    lastCount: lastCount ?? null,
    cost: cost ? { ...cost, until, sales: salesTotal, purchases: buysUntil!.total } : null,
  };
}
