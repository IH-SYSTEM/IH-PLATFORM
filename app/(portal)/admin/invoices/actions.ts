"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty } from "@/lib/duties";
import { readExpense } from "@/lib/expenses";
import { createAdminClient } from "@/lib/supabase/admin";

export type InvoiceState = { ok?: string; error?: string; at?: number } | undefined;

/**
 * 請求書を取り込む（経理の担当と代表）。先に保存場所へ上げたファイルを請求書として登録し、裏で AI が読む。
 * 一度確かめた取引先は自動で振り分けて承認、分からないものはアップした人に「どこの店の何の経費ですか？」と聞く
 */
export async function addInvoices(fileIds: string[]): Promise<InvoiceState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return { error: "請求書は経理の担当だけが取り込めます", at: Date.now() };
  const admin = createAdminClient();
  const { data: files } = await admin.from("files").select("id").in("id", fileIds.slice(0, 100)).eq("uploaded_by", me.id).eq("status", "ready");
  const { data: used } = await admin.from("expenses").select("receipt_file_id").in("receipt_file_id", (files ?? []).map((f) => f.id));
  const ids = (files ?? []).map((f) => f.id).filter((id) => !(used ?? []).some((u) => u.receipt_file_id === id));
  if (!ids.length) return { error: "取り込めるファイルがありません", at: Date.now() };
  const { data: rows, error } = await admin
    .from("expenses")
    .insert(ids.map((file) => ({ doc_type: "invoice", status: "reading", payment_method: "transfer", reporter_id: me.id, receipt_file_id: file })))
    .select("id");
  if (error || !rows) return { error: "取り込めませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "invoices", detail: { count: rows.length } });
  after(async () => {
    for (let i = 0; i < rows.length; i += 3) await Promise.all(rows.slice(i, i + 3).map((r) => readExpense(r.id)));
  });
  revalidatePath("/admin/invoices");
  return { ok: `${rows.length}枚を取り込みました。AI が読んで振り分けます（1枚30秒ほど）`, at: Date.now() };
}
