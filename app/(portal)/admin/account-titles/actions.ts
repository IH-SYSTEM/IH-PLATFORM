"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";

export type TitleState = { ok?: string; error?: string; at?: number } | undefined;
const DENIED = "勘定科目は経理の担当だけが変えられます";

/** 勘定科目を足す（名前はマネーフォワードの勘定科目と同じにする） */
export async function addAccountTitle(_prev: TitleState, fd: FormData): Promise<TitleState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return { error: DENIED, at: Date.now() };
  const name = String(fd.get("name") ?? "").trim();
  const hint = String(fd.get("hint") ?? "").trim().slice(0, 200) || null;
  if (!name || name.length > 40) return { error: "勘定科目の名前を入れてください（40文字まで）", at: Date.now() };
  const { error } = await createAdminClient().from("account_titles").insert({ name, hint, sort: Number(fd.get("sort")) || 500, created_by: me.id });
  if (error) return { error: error.code === "23505" ? "同じ名前の勘定科目があります" : "足せませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "account_title", targetId: name, detail: { hint } });
  revalidatePath("/admin/account-titles");
  return { ok: `「${name}」を足しました`, at: Date.now() };
}

/** 目安・並び・使う／使わないを直す（名前は変えない。過去の経費と CSV が合わなくなるため） */
export async function updateAccountTitle(name: string, _prev: TitleState, fd: FormData): Promise<TitleState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) return { error: DENIED, at: Date.now() };
  const { error } = await createAdminClient()
    .from("account_titles")
    .update({ hint: String(fd.get("hint") ?? "").trim().slice(0, 200) || null, sort: Number(fd.get("sort")) || 0, active: fd.get("active") === "on" })
    .eq("name", name);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "account_title", targetId: name });
  revalidatePath("/admin/account-titles");
  return { ok: "保存しました", at: Date.now() };
}
