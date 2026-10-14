"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canUseVault } from "@/lib/files";
import { hashPassword, newPassword } from "@/lib/partner-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PState = { ok?: string; error?: string; password?: string; at?: number } | undefined;
const DENIED = "取引先（銀行）は、経理・総務の担当だけが扱えます";

async function gate() {
  const me = await requireAdmin();
  if (!canUseVault(me)) throw new Error(DENIED);
  return me;
}

/** 銀行を登録する */
export async function createPartner(_prev: PState, fd: FormData): Promise<PState> {
  const me = await gate();
  const name = String(fd.get("name") ?? "").trim();
  if (!name || name.length > 100) return { error: "銀行の名前を入れてください（例：肥後銀行 熊本営業部）", at: Date.now() };
  const { data, error } = await createAdminClient().from("partners").insert({ name, note: String(fd.get("note") ?? "").trim() || null, created_by: me.id }).select("id").single();
  if (error || !data) return { error: "登録できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "partner", targetId: data.id, detail: { name } });
  redirect(`/admin/partners/${data.id}`);
}

/** 担当者を足す。初めのパスワードを1回だけ返す（画面に出す。メールでは送らない） */
export async function addPartnerUser(partnerId: string, _prev: PState, fd: FormData): Promise<PState> {
  const me = await gate();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const expires = String(fd.get("expires_on") ?? "");
  if (!name) return { error: "担当者の名前を入れてください", at: Date.now() };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "メールアドレスを正しく入れてください", at: Date.now() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: "有効期限を選んでください", at: Date.now() };
  const password = newPassword();
  const { data, error } = await createAdminClient()
    .from("partner_users")
    .insert({ partner_id: partnerId, name, email, password_hash: await hashPassword(password), expires_on: expires, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23505" ? "このメールアドレスは、もう登録されています" : "登録できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "create", targetType: "partner_user", targetId: data.id, detail: { partnerId, email, expires } });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: `${name}様のIDを作りました`, password, at: Date.now() };
}

/** パスワードを作り直す（今のログインも切る） */
export async function resetPartnerPassword(userId: string, partnerId: string, _prev: PState): Promise<PState> {
  const me = await gate();
  const password = newPassword();
  const admin = createAdminClient();
  await admin.from("partner_users").update({ password_hash: await hashPassword(password), failed_count: 0, locked_until: null }).eq("id", userId).eq("partner_id", partnerId);
  await admin.from("partner_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  await audit({ actor: me.id, action: "update", targetType: "partner_user", targetId: userId, detail: { resetPassword: true } });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: "パスワードを作り直しました", password, at: Date.now() };
}

/** 有効期限を変える・止める（止めるとログイン中でもすぐ切れる） */
export async function updatePartnerUser(userId: string, partnerId: string, _prev: PState, fd: FormData): Promise<PState> {
  const me = await gate();
  const expires = String(fd.get("expires_on") ?? "");
  const active = fd.get("is_active") === "on";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: "有効期限を選んでください", at: Date.now() };
  const admin = createAdminClient();
  await admin.from("partner_users").update({ expires_on: expires, is_active: active }).eq("id", userId).eq("partner_id", partnerId);
  if (!active) await admin.from("partner_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  await audit({ actor: me.id, action: "update", targetType: "partner_user", targetId: userId, detail: { expires, active } });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: "保存しました", at: Date.now() };
}

/** 見せるものを、画面で選んだとおりに置き換える（書類と、売上を見せる会社） */
export async function saveShares(partnerId: string, _prev: PState, fd: FormData): Promise<PState> {
  const me = await gate();
  const admin = createAdminClient();
  const fileIds = fd.getAll("file").map(String);
  const companyIds = fd.getAll("sales").map(String);
  // 会社の書類（保管庫）にあるものだけを見せられる
  const { data: okFiles } = fileIds.length ? await admin.from("files").select("id").in("id", fileIds).not("owner_company_id", "is", null).eq("status", "ready") : { data: [] };
  const { data: okCompanies } = companyIds.length ? await admin.from("companies").select("id").in("id", companyIds) : { data: [] };
  await admin.from("partner_shares").delete().eq("partner_id", partnerId);
  const rows = [
    ...(okFiles ?? []).map((f) => ({ partner_id: partnerId, kind: "file", file_id: f.id, created_by: me.id })),
    ...(okCompanies ?? []).map((c) => ({ partner_id: partnerId, kind: "sales", company_id: c.id, created_by: me.id })),
  ];
  if (rows.length) {
    const { error } = await admin.from("partner_shares").insert(rows);
    if (error) return { error: "保存できませんでした", at: Date.now() };
  }
  await audit({ actor: me.id, action: "update", targetType: "partner_share", targetId: partnerId, detail: { files: rows.filter((r) => r.kind === "file").length, sales: (okCompanies ?? []).map((c) => c.id) } });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: `見せるものを保存しました（書類 ${(okFiles ?? []).length}件・売上 ${(okCompanies ?? []).length}社）`, at: Date.now() };
}

/** 銀行ごと止める（担当者は全員すぐ入れなくなる） */
export async function togglePartner(partnerId: string, active: boolean) {
  const me = await gate();
  const admin = createAdminClient();
  await admin.from("partners").update({ is_active: active }).eq("id", partnerId);
  if (!active) {
    const { data: users } = await admin.from("partner_users").select("id").eq("partner_id", partnerId);
    if (users?.length) await admin.from("partner_sessions").update({ revoked_at: new Date().toISOString() }).in("user_id", users.map((u) => u.id)).is("revoked_at", null);
  }
  await audit({ actor: me.id, action: "update", targetType: "partner", targetId: partnerId, detail: { active } });
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/admin/partners");
}
