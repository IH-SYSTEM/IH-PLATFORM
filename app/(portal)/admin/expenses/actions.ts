"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty } from "@/lib/duties";
import { isAccountTitle, readExpense } from "@/lib/expenses";
import { pushLine } from "@/lib/line-push";
import { learnVendorRule } from "@/lib/vendor-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExpenseInput = {
  expense_date: string;
  vendor: string;
  invoice_number: string;
  payment_method: "cash" | "transfer";
  store_id: string;
  lines: { account_title: string; tax_rate: number; amount: number; item: string }[];
};
export type SaveResult = { ok?: string; error?: string; nextId?: string | null; at?: number };

const DENIED = "経費は経理の担当だけが扱えます";
const fail = (error: string): SaveResult => ({ error, at: Date.now() });

/** 確認待ちの次の1件（古い順）。after を渡すと、それより後に届いたもの（なければ最初に戻る） */
export async function nextPendingId(exceptId?: string, afterCreated?: string): Promise<string | null> {
  const admin = createAdminClient();
  const base = () => {
    let q = admin.from("expenses").select("id").in("status", ["pending", "question"]).order("created_at").limit(1);
    if (exceptId) q = q.neq("id", exceptId);
    return q;
  };
  if (afterCreated) {
    const { data } = await base().gt("created_at", afterCreated);
    if (data?.length) return data[0].id;
  }
  const { data } = await base();
  return data?.[0]?.id ?? null;
}

/**
 * 経費を保存する（approve=true なら承認も）。内訳の合計が金額になる。承認には日付と、全部の内訳の勘定科目が要る。
 * マネーフォワードに書き出したものは直せない
 */
export async function saveExpense(id: string, input: ExpenseInput, approve: boolean): Promise<SaveResult> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return fail(DENIED);
  const admin = createAdminClient();
  const { data: e } = await admin.from("expenses").select("id, status, exported_at, created_at, doc_type").eq("id", id).maybeSingle();
  if (!e) return fail("経費が見つかりません");
  if (e.exported_at) return fail("マネーフォワードに書き出したあとは直せません");
  const lines = input.lines
    .map((l) => ({ account_title: l.account_title || null, tax_rate: Number(l.tax_rate), amount: Math.round(Number(l.amount)), item: String(l.item ?? "").trim().slice(0, 200) }))
    .filter((l) => l.amount);
  if (lines.some((l) => ![0, 8, 10].includes(l.tax_rate))) return fail("税率を選んでください");
  if (lines.some((l) => l.account_title && !isAccountTitle(l.account_title))) return fail("勘定科目を選んでください");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.expense_date) ? input.expense_date : null;
  const inv = input.invoice_number.replace(/[^\dTt]/g, "").toUpperCase();
  if (inv && !/^T\d{13}$/.test(inv)) return fail("登録番号は T と13桁の数字です");
  if (approve) {
    if (!date) return fail("日付を入れてください");
    if (!lines.length) return fail("金額を入れてください");
    if (lines.some((l) => !l.account_title)) return fail("すべての行の勘定科目を選んでください");
  }
  const { data: store } = await admin.from("stores").select("id, company_id").eq("id", input.store_id).maybeSingle();
  if (!store) return fail("店を選んでください");
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("expenses")
    .update({
      expense_date: date,
      vendor: input.vendor.trim().slice(0, 100) || null,
      invoice_number: inv || null,
      payment_method: input.payment_method === "transfer" ? "transfer" : "cash",
      store_id: store.id,
      company_id: store.company_id,
      amount: total || null,
      tax_rate: lines[0]?.tax_rate ?? null,
      account_title: lines[0]?.account_title ?? null,
      item: lines.map((l) => l.item).filter(Boolean).join("、").slice(0, 200) || null,
      updated_at: now,
      ...(approve ? { status: "approved", approved_by: me.id, approved_at: now, reject_reason: null, question: null } : e.status === "reading" ? { status: "pending" } : {}),
    })
    .eq("id", id)
    .is("exported_at", null);
  if (error) return fail("保存できませんでした");
  await admin.from("expense_lines").delete().eq("expense_id", id);
  if (lines.length) await admin.from("expense_lines").insert(lines.map((l, i) => ({ expense_id: id, sort: i, ...l })));
  // 請求書：確かめた（または直した）店・勘定科目を、その取引先の決まりとして覚える。次からは自動で振り分ける（2026-10-22）
  if (e.doc_type === "invoice" && (approve || e.status === "approved")) {
    await learnVendorRule({ id, invoice_number: inv || null, vendor: input.vendor.trim() || null, store_id: store.id, account_title: lines[0]?.account_title ?? null, tax_rate: lines[0]?.tax_rate ?? null }, me.id);
  }
  await audit({ actor: me.id, action: "update", targetType: "expense", targetId: id, detail: { approve, total, lines: lines.length } });
  revalidatePath("/admin/expenses");
  const nextId = approve ? await nextPendingId(id) : undefined;
  return { ok: approve ? "承認しました" : "保存しました", nextId, at: Date.now() };
}

/** 差し戻す（撮り直し・関係ない写真など）。送った人に LINE で理由を知らせる */
export async function rejectExpense(id: string, reason: string): Promise<SaveResult> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return fail(DENIED);
  const text = reason.trim().slice(0, 200);
  if (!text) return fail("差し戻す理由を書いてください");
  const admin = createAdminClient();
  const { data: e } = await admin.from("expenses").update({ status: "rejected", reject_reason: text, updated_at: new Date().toISOString() }).eq("id", id).in("status", ["reading", "pending", "question"]).select("reporter_id, created_at").maybeSingle();
  if (!e) return fail("差し戻せませんでした（承認済みか、見つかりません）");
  await audit({ actor: me.id, action: "update", targetType: "expense", targetId: id, detail: { reject: text } });
  if (e.reporter_id) {
    const { data: who } = await admin.from("staff").select("line_user_id").eq("id", e.reporter_id).single();
    await pushLine([who?.line_user_id], `【経費】送ったレシートが本部から差し戻されました\n理由：${text}\n撮り直して、もう一度送ってください`, "report");
  }
  revalidatePath("/admin/expenses");
  return { ok: "差し戻しました（送った人に LINE で知らせました）", nextId: await nextPendingId(id), at: Date.now() };
}

/** AI にもう一度読ませる（読めなかったとき） */
export async function rereadExpense(id: string): Promise<SaveResult> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return fail(DENIED);
  const { data } = await createAdminClient().from("expenses").update({ status: "reading" }).eq("id", id).in("status", ["reading", "pending", "question"]).select("id");
  if (!data?.length) return fail("読み直せません");
  after(() => readExpense(id));
  return { ok: "AI が読み直しています（30秒ほどで再読み込みしてください）", at: Date.now() };
}
