"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseAirRegi } from "@/lib/pos/airregi";
import { savePosReceipts } from "@/lib/pos/save";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState = { ok?: string; error?: string; at?: number } | undefined;

/** エアレジの会計明細CSVを取り込む */
export async function importAirRegi(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const me = await requireAdmin();
  const fail = (error: string) => ({ error, at: Date.now() });
  const storeId = String(fd.get("store_id") ?? "");
  const file = fd.get("file");
  if (!storeId) return fail("店舗を選んでください");
  if (!(file instanceof File) || !file.size) return fail("CSVファイルを選んでください");

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name").eq("id", storeId).single();
  if (!store) return fail("店舗が見つかりません");

  const buf = Buffer.from(await file.arrayBuffer());
  const { receipts, error } = parseAirRegi(new TextDecoder("shift_jis").decode(buf));
  if (error) return fail(error);
  const saved = await savePosReceipts(admin, { storeId, source: "airregi", fileName: file.name, file: buf, receipts, importedBy: me.id });
  if (saved.error) return fail(saved.error);

  await audit({ actor: me.id, action: "create", targetType: "pos_import", targetId: storeId, detail: { store: store.name, receipts: receipts.length } });
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sales");
  revalidatePath("/");
  return { ok: `${store.name}：${saved.dateFrom}〜${saved.dateTo} の会計 ${receipts.length}件（${saved.total?.toLocaleString()}円）を取り込みました`, at: Date.now() };
}
