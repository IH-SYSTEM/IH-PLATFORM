"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BUCKET } from "@/lib/files";
import { parseAirRegi } from "@/lib/pos/airregi";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState = { ok?: string; error?: string; at?: number } | undefined;

/**
 * エアレジの会計明細CSVを取り込む。同じ会計（取引No）は上書きするので、期間が重なっても二重にならない。
 * 原本は private-files の pos/ に残す（あとで集計ルールを変えても取り込み直せるように）
 */
export async function importAirRegi(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const me = await requireAdmin();
  const fail = (error: string) => ({ error, at: Date.now() });
  const storeId = String(fd.get("store_id") ?? "");
  const file = fd.get("file");
  if (!storeId) return fail("店舗を選んでください");
  if (!(file instanceof File) || !file.size) return fail("CSVファイルを選んでください");

  const buf = Buffer.from(await file.arrayBuffer());
  const { receipts, error } = parseAirRegi(new TextDecoder("shift_jis").decode(buf));
  if (error) return fail(error);
  if (!receipts.length) return fail("会計が1件も入っていません");

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name").eq("id", storeId).single();
  if (!store) return fail("店舗が見つかりません");

  // 別の店のCSVを取り違えていないか：既に別の店に同じ取引Noがあれば止める
  const nos = receipts.map((r) => r.receiptNo);
  const { data: clash } = await admin.from("pos_receipts").select("store_id").eq("source", "airregi").in("receipt_no", nos.slice(0, 200)).neq("store_id", storeId).limit(1);
  if (clash?.length) return fail("このCSVは別の店舗で取り込み済みの会計を含んでいます。店舗の選び間違いがないか確かめてください");

  const sha = createHash("sha256").update(buf).digest("hex");
  const path = `pos/${storeId}/${sha}.csv`;
  await admin.storage.from(BUCKET).upload(path, buf, { contentType: "text/csv", upsert: true });
  const dates = receipts.map((r) => r.businessDate).sort();
  const { data: imp, error: impErr } = await admin
    .from("pos_imports")
    .insert({ store_id: storeId, source: "airregi", file_name: file.name, file_sha256: sha, file_path: path, receipts: receipts.length, date_from: dates[0], date_to: dates.at(-1), imported_by: me.id })
    .select("id")
    .single();
  if (impErr) {
    console.error("pos import failed", impErr);
    return fail("取り込めませんでした");
  }

  for (let i = 0; i < receipts.length; i += 300) {
    const chunk = receipts.slice(i, i + 300);
    const { data: saved, error: e } = await admin
      .from("pos_receipts")
      .upsert(
        chunk.map((r) => ({
          store_id: storeId,
          source: "airregi",
          receipt_no: r.receiptNo,
          business_date: r.businessDate,
          checkout_at: r.checkoutAt,
          total: r.total,
          tax: r.tax,
          people: r.people,
          items: r.items,
          discount: r.discount,
          payments: r.payments,
          cashier: r.cashier || null,
          slip: r.slip || null,
          import_id: imp.id,
        })),
        { onConflict: "store_id,source,receipt_no" },
      )
      .select("id, receipt_no");
    if (e || !saved) {
      console.error("pos receipts upsert failed", e);
      return fail("途中で止まりました。もう一度同じファイルを取り込んでください（二重にはなりません）");
    }
    const idOf = new Map(saved.map((s) => [s.receipt_no, s.id]));
    await admin.from("pos_receipt_items").delete().in("receipt_id", saved.map((s) => s.id));
    const lines = chunk.flatMap((r) => r.lines.map((l) => ({ receipt_id: idOf.get(r.receiptNo), category: l.category || null, name: l.name, price: l.price, qty: l.qty, discount: l.discount })));
    for (let j = 0; j < lines.length; j += 1000) await admin.from("pos_receipt_items").insert(lines.slice(j, j + 1000));
  }

  await audit({ actor: me.id, action: "create", targetType: "pos_import", targetId: imp.id, detail: { store: store.name, receipts: receipts.length } });
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sales");
  const total = receipts.reduce((s, r) => s + r.total, 0);
  return { ok: `${store.name}：${dates[0]}〜${dates.at(-1)} の会計 ${receipts.length}件（${total.toLocaleString()}円）を取り込みました`, at: Date.now() };
}
