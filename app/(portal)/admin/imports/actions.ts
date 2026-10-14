"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { hasDuty, noDutyMessage } from "@/lib/duties";
import { audit } from "@/lib/audit";
import { DAILY_PREFIX, parseAirRegi, parseAirRegiDaily } from "@/lib/pos/airregi";
import { savePosReceipts } from "@/lib/pos/save";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState = { ok?: string; error?: string; at?: number } | undefined;

/** エアレジの CSV を取り込む。「会計明細」（会計ごと）と「売上集計」（日ごとの合計。過去の分）のどちらでもよい */
export async function importAirRegi(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input")) return { error: noDutyMessage("keiri_input"), at: Date.now() };
  const fail = (error: string) => ({ error, at: Date.now() });
  const storeId = String(fd.get("store_id") ?? "");
  const file = fd.get("file");
  if (!storeId) return fail("店舗を選んでください");
  if (!(file instanceof File) || !file.size) return fail("CSVファイルを選んでください");

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name").eq("id", storeId).single();
  if (!store) return fail("店舗が見つかりません");

  const buf = Buffer.from(await file.arrayBuffer());
  const text = new TextDecoder("shift_jis").decode(buf);
  const detail = parseAirRegi(text);
  const daily = detail.error ? parseAirRegiDaily(text, storeId) : null;
  if (daily?.error) return fail(daily.error);
  let receipts = daily ? daily.receipts : detail.receipts;
  let skipped = 0;
  if (daily) {
    // 「会計明細」がもう入っている日は入れない（明細のほうが細かい・二重に数えない）
    const dates = receipts.map((r) => r.businessDate);
    const { data: have } = await admin
      .from("pos_receipts")
      .select("business_date")
      .eq("store_id", storeId)
      .eq("source", "airregi")
      .not("receipt_no", "like", `${DAILY_PREFIX}%`)
      .gte("business_date", dates.reduce((a, b) => (a < b ? a : b)))
      .lte("business_date", dates.reduce((a, b) => (a > b ? a : b)));
    const covered = new Set((have ?? []).map((h) => h.business_date));
    skipped = receipts.filter((r) => covered.has(r.businessDate)).length;
    receipts = receipts.filter((r) => !covered.has(r.businessDate));
    if (!receipts.length) return fail("この期間は、もう「会計明細」で取り込まれています（二重には入れません）");
  }
  const saved = await savePosReceipts(admin, { storeId, source: "airregi", fileName: file.name, file: buf, receipts, importedBy: me.id });
  if (saved.error) return fail(saved.error);
  if (!daily) {
    // 「会計明細」を入れた日に「売上集計」の日計があれば消す（二重に数えない）
    await admin
      .from("pos_receipts")
      .delete()
      .eq("store_id", storeId)
      .eq("source", "airregi")
      .like("receipt_no", `${DAILY_PREFIX}%`)
      .in("business_date", [...new Set(receipts.map((r) => r.businessDate))]);
  }

  await audit({ actor: me.id, action: "create", targetType: "pos_import", targetId: storeId, detail: { store: store.name, receipts: receipts.length } });
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sales");
  revalidatePath("/");
  return {
    ok: daily
      ? `${store.name}：${saved.dateFrom}〜${saved.dateTo} の日ごとの合計 ${receipts.length}日分（${saved.total?.toLocaleString()}円）を取り込みました${skipped ? `（会計明細がある${skipped}日は入れていません）` : ""}`
      : `${store.name}：${saved.dateFrom}〜${saved.dateTo} の会計 ${receipts.length}件（${saved.total?.toLocaleString()}円）を取り込みました`,
    at: Date.now(),
  };
}
