"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { hasDuty, noDutyMessage } from "@/lib/duties";
import { audit } from "@/lib/audit";
import { importAirRegiBuffer } from "@/lib/pos/import-airregi";

export type ImportState = { ok?: string; error?: string; at?: number } | undefined;

/** エアレジの CSV を取り込む。「会計明細」（会計ごと）と「売上集計」（日ごとの合計。過去の分）のどちらでもよい */
export async function importAirRegi(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input")) return { error: noDutyMessage("keiri_input"), at: Date.now() };
  const storeId = String(fd.get("store_id") ?? "");
  const file = fd.get("file");
  if (!storeId) return { error: "店舗を選んでください", at: Date.now() };
  if (!(file instanceof File) || !file.size) return { error: "CSVファイルを選んでください", at: Date.now() };
  const r = await importAirRegiBuffer({ storeId, fileName: file.name, buf: Buffer.from(await file.arrayBuffer()), importedBy: me.id });
  if ("error" in r) return { error: r.error, at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "pos_import", targetId: storeId, detail: { message: r.ok } });
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sales");
  revalidatePath("/");
  return { ok: r.ok, at: Date.now() };
}
