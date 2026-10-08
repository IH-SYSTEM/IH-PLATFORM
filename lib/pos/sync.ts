import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCrm } from "./crm";
import { fetchIkkou } from "./ikkou";
import { savePosReceipts } from "./save";

/** 自動で取り込む店：店舗コード → 読み方 */
export const AUTO_SOURCES = {
  IKK: { source: "ikkou" as const, fetch: (from: string, to: string) => fetchIkkou(from, to) },
  CFM: { source: "crm" as const, fetch: (from: string, to: string) => fetchCrm("CFM", from, to) },
  SKC: { source: "crm" as const, fetch: (from: string, to: string) => fetchCrm("SKC", from, to) },
};
export type AutoCode = keyof typeof AUTO_SOURCES;

/** 1店分を取り込む。同じ会計・来店は上書きなので、期間が重なっても二重にならない */
export async function syncStore(code: AutoCode, from: string, to: string) {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").eq("code", code).single();
  if (!store) return { code, error: `店舗 ${code} がありません` };
  const src = AUTO_SOURCES[code];
  const { receipts, raw, error } = await src.fetch(from, to);
  if (error) return { code, error };
  if (!receipts.length) return { code, receipts: 0 };
  const saved = await savePosReceipts(admin, { storeId: store.id, source: src.source, fileName: `${code}_${from}_${to}.json`, file: Buffer.from(raw), receipts, importedBy: null });
  return saved.error ? { code, error: saved.error } : { code, receipts: receipts.length, total: saved.total };
}
