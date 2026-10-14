import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAILY_PREFIX, parseAirRegi, parseAirRegiDaily } from "./airregi";
import { savePosReceipts } from "./save";

/** エアレジの CSV か（会計明細・売上集計のどちらか）。データ保管庫で、どの読み方にするかを決めるのに使う */
export function airRegiKind(text: string): "detail" | "daily" | null {
  if (!parseAirRegi(text).error) return "detail";
  return parseAirRegiDaily(text, "x").error ? null : "daily";
}

/**
 * エアレジの CSV を、その店の売上として取り込む（取り込み画面とデータ保管庫の両方から）。
 * 「会計明細」（会計ごと）と「売上集計」（日ごとの合計）のどちらでもよい。同じ日に会計明細があればそちらを使い、二重に数えない
 */
export async function importAirRegiBuffer(opts: { storeId: string; fileName: string; buf: Buffer; importedBy: string | null }): Promise<{ ok: string } | { error: string }> {
  const { storeId, buf } = opts;
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name").eq("id", storeId).single();
  if (!store) return { error: "店舗が見つかりません" };
  const text = new TextDecoder("shift_jis").decode(buf);
  const detail = parseAirRegi(text);
  const daily = detail.error ? parseAirRegiDaily(text, storeId) : null;
  if (daily?.error) return { error: daily.error };
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
    if (!receipts.length) return { error: "この期間は、もう「会計明細」で取り込まれています（二重には入れません）" };
  }
  const saved = await savePosReceipts(admin, { storeId, source: "airregi", fileName: opts.fileName, file: buf, receipts, importedBy: opts.importedBy });
  if (saved.error) return { error: saved.error };
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
  return {
    ok: daily
      ? `${store.name}：${saved.dateFrom}〜${saved.dateTo} の日ごとの合計 ${receipts.length}日分（${saved.total?.toLocaleString()}円）を取り込みました${skipped ? `（会計明細がある${skipped}日は入れていません）` : ""}`
      : `${store.name}：${saved.dateFrom}〜${saved.dateTo} の会計 ${receipts.length}件（${saved.total?.toLocaleString()}円）を取り込みました`,
  };
}
