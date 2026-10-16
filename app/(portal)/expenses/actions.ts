"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readExpense } from "@/lib/expenses";
import { pushLine } from "@/lib/line-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendState = { ok?: string; error?: string; at?: number } | undefined;

/** 経理の担当（入力・承認）の LINE */
async function keiriLines() {
  const admin = createAdminClient();
  const { data } = await admin.from("staff_duties").select("staff_id").in("duty", ["keiri_input", "keiri_approve"]);
  const ids = [...new Set((data ?? []).map((d) => d.staff_id))];
  if (!ids.length) return [];
  const { data: people } = await admin.from("staff").select("line_user_id").in("id", ids).eq("retired", false);
  return (people ?? []).map((p) => p.line_user_id);
}

/**
 * 撮ったレシートを本部に送る（だれでも）。1枚＝経費1件。届いたらすぐ AI が読み（裏で）、経理に LINE を1通だけ送る
 */
export async function sendReceipts(input: { storeId: string; payment: "cash" | "transfer"; items: { fileId: string; memo: string }[] }): Promise<SendState> {
  const me = await requireStaff();
  const items = input.items.slice(0, 50);
  if (!items.length) return { error: "写真を撮ってください", at: Date.now() };
  if (input.payment !== "cash" && input.payment !== "transfer") return { error: "支払い方法を選んでください", at: Date.now() };
  const admin = createAdminClient();
  const [{ data: store }, { data: files }] = await Promise.all([
    admin.from("stores").select("id, name, company_id").eq("id", input.storeId).eq("is_active", true).maybeSingle(),
    admin.from("files").select("id").in("id", items.map((i) => i.fileId)).eq("uploaded_by", me.id).eq("category", "receipt").eq("status", "ready"),
  ]);
  if (!store) return { error: "店を選んでください", at: Date.now() };
  const ok = new Set((files ?? []).map((f) => f.id));
  const { data: already } = await admin.from("expenses").select("receipt_file_id").in("receipt_file_id", [...ok]);
  for (const a of already ?? []) ok.delete(a.receipt_file_id!);
  const list = items.filter((i) => ok.has(i.fileId));
  if (!list.length) return { error: "送れる写真がありません（もう送ったか、まだ届いていません）", at: Date.now() };

  const batch = randomUUID();
  const { data: rows, error } = await admin
    .from("expenses")
    .insert(
      list.map((i) => ({
        status: "reading",
        batch_id: batch,
        store_id: store.id,
        company_id: store.company_id,
        reporter_id: me.id,
        receipt_file_id: i.fileId,
        payment_method: input.payment,
        staff_memo: i.memo.trim().slice(0, 200) || null,
        purpose: i.memo.trim().slice(0, 200) || null,
      })),
    )
    .select("id");
  if (error || !rows) return { error: "送れませんでした。もう一度押してください", at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "expense_batch", targetId: batch, detail: { store: store.id, count: rows.length, payment: input.payment } });

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const ids = rows.map((r) => r.id);
  after(async () => {
    // 3枚ずつ並べて読む
    for (let i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map((id) => readExpense(id)));
    await pushLine(await keiriLines(), `【経費】${store.name}の${me.name}さんから、レシートが${ids.length}枚届きました（AI が読み終わっています）\n${origin}/admin/expenses/review`, "report");
  });
  revalidatePath("/expenses");
  return { ok: `${rows.length}枚を本部に送りました`, at: Date.now() };
}
