/**
 * レジの会計をデータベースに保存する（取り込み画面と、まとめて入れるスクリプトの両方から使う）。
 * 同じ会計（店舗＋レジ＋取引No）は上書きするので、期間が重なっても二重にならない。原本は private-files の pos/ に残す
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosReceipt } from "./airregi.ts";

export async function savePosReceipts(
  admin: SupabaseClient,
  opts: { storeId: string; source: "airregi"; fileName: string; file: Buffer; receipts: PosReceipt[]; importedBy: string | null },
): Promise<{ error?: string; dateFrom?: string; dateTo?: string; total?: number }> {
  const { storeId, source, receipts } = opts;
  if (!receipts.length) return { error: "会計が1件も入っていません" };

  // 別の店のCSVを取り違えていないか：既に別の店に同じ取引Noがあれば止める
  const { data: clash } = await admin
    .from("pos_receipts")
    .select("store_id")
    .eq("source", source)
    .in("receipt_no", receipts.slice(0, 200).map((r) => r.receiptNo))
    .neq("store_id", storeId)
    .limit(1);
  if (clash?.length) return { error: "このCSVは別の店舗で取り込み済みの会計を含んでいます。店舗の選び間違いがないか確かめてください" };

  const sha = createHash("sha256").update(opts.file).digest("hex");
  const path = `pos/${storeId}/${sha}.csv`;
  await admin.storage.from("private-files").upload(path, opts.file, { contentType: "text/csv", upsert: true });
  const dates = receipts.map((r) => r.businessDate).sort();
  const { data: imp, error: impErr } = await admin
    .from("pos_imports")
    .insert({ store_id: storeId, source, file_name: opts.fileName, file_sha256: sha, file_path: path, receipts: receipts.length, date_from: dates[0], date_to: dates.at(-1), imported_by: opts.importedBy })
    .select("id")
    .single();
  if (impErr || !imp) return { error: `取り込めませんでした（${impErr?.message ?? ""}）` };

  for (let i = 0; i < receipts.length; i += 300) {
    const chunk = receipts.slice(i, i + 300);
    const { data: saved, error } = await admin
      .from("pos_receipts")
      .upsert(
        chunk.map((r) => ({
          store_id: storeId,
          source,
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
    if (error || !saved) return { error: "途中で止まりました。もう一度同じファイルを取り込んでください（二重にはなりません）" };
    const idOf = new Map(saved.map((s: { id: string; receipt_no: string }) => [s.receipt_no, s.id]));
    await admin.from("pos_receipt_items").delete().in("receipt_id", [...idOf.values()]);
    const lines = chunk.flatMap((r) =>
      r.lines.map((l) => ({ receipt_id: idOf.get(r.receiptNo), category: l.category || null, name: l.name, price: l.price, qty: l.qty, discount: l.discount })),
    );
    for (let j = 0; j < lines.length; j += 1000) {
      const { error: e } = await admin.from("pos_receipt_items").insert(lines.slice(j, j + 1000));
      if (e) return { error: "注文の明細を保存できませんでした。もう一度同じファイルを取り込んでください" };
    }
  }
  return { dateFrom: dates[0], dateTo: dates.at(-1), total: receipts.reduce((s, r) => s + r.total, 0) };
}
