"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty } from "@/lib/duties";
import { ACCOUNT_TITLES } from "@/lib/expenses";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExpState = { ok?: string; error?: string; at?: number } | undefined;

/** 経費を直す（勘定科目・税率・お店・金額・日付）。経理の担当か代表だけ */
export async function updateExpense(id: string, _prev: ExpState, fd: FormData): Promise<ExpState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return { error: "経費は経理の担当だけが直せます", at: Date.now() };
  const account = String(fd.get("account_title") ?? "");
  const tax = Number(fd.get("tax_rate"));
  const amount = Number(String(fd.get("amount") ?? "").replace(/[,\s円]/g, ""));
  const date = String(fd.get("expense_date") ?? "");
  if (account && !(ACCOUNT_TITLES as readonly string[]).includes(account)) return { error: "勘定科目を選んでください", at: Date.now() };
  if (![0, 8, 10].includes(tax)) return { error: "税率を選んでください", at: Date.now() };
  if (!Number.isInteger(amount) || amount === 0) return { error: "金額を円の整数で入れてください", at: Date.now() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付を選んでください", at: Date.now() };
  const { error } = await createAdminClient()
    .from("expenses")
    .update({ account_title: account || null, tax_rate: tax, amount, expense_date: date, vendor: String(fd.get("vendor") ?? "").trim().slice(0, 100) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("exported_at", null);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "expense", targetId: id, detail: { account, tax, amount, date } });
  revalidatePath("/admin/expenses");
  return { ok: "直しました", at: Date.now() };
}
