"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { rebuildCompanyHistory, summarizeVaultFile } from "@/lib/ai-guide/vault-ai";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BUCKET, VAULT_MAX_BYTES, VAULT_TYPES, canUseVault, isVaultCategory, newPath, signedUploadFor } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

const DENIED = "会社の書類は、経理・総務の担当だけが扱えます";
export type VaultStart = { fileId: string; path: string; token: string } | { error: string };

/** 会社の書類のアップロードの準備（台帳に「準備中」で登録し、1回だけ使えるアップロードURLを返す） */
export async function startVaultUpload(input: { companyId: string; category: string; name: string; contentType: string; size: number; docDate: string; note: string }): Promise<VaultStart> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED };
  if (!isVaultCategory(input.category)) return { error: "書類の種類を選んでください" };
  if (!(input.contentType in VAULT_TYPES)) return { error: "PDF・写真・Excel・Word・CSV を選んでください" };
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > VAULT_MAX_BYTES) return { error: "50MB以下のファイルを選んでください" };
  if (input.docDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.docDate)) return { error: "日付が正しくありません" };
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id").eq("id", input.companyId).maybeSingle();
  if (!company) return { error: "会社を選んでください" };

  const path = newPath(input.category, `company-${company.id}`, input.contentType);
  const { data, error } = await admin
    .from("files")
    .insert({
      path,
      category: input.category,
      owner_staff_id: null,
      owner_company_id: company.id,
      name: input.name.slice(0, 200) || "ファイル",
      content_type: input.contentType,
      size_bytes: input.size,
      visible_to_owner: false,
      doc_date: input.docDate || null,
      note: input.note.trim().slice(0, 500) || null,
      uploaded_by: me.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("startVaultUpload failed", error);
    return { error: "アップロードを準備できませんでした" };
  }
  const signed = await signedUploadFor(path);
  return { fileId: data.id, path, token: signed.token };
}

/** アップロードの完了（保存場所に届いたことを確かめてから「使える」に） */
export async function finishVaultUpload(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED };
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("id, path, owner_company_id, category, name, uploaded_by, status").eq("id", fileId).maybeSingle();
  if (!f || !f.owner_company_id || f.uploaded_by !== me.id || f.status !== "pending") return { error: "アップロードを確認できませんでした" };
  const { data: exists } = await admin.storage.from(BUCKET).exists(f.path);
  if (!exists) return { error: "ファイルが届いていません。もう一度お試しください" };
  await admin.from("files").update({ status: "ready" }).eq("id", fileId);
  await audit({ actor: me.id, action: "upload", targetType: "company_file", targetId: fileId, detail: { company: f.owner_company_id, category: f.category, name: f.name } });
  // 返事のあとで、AI が中身を読んで要約し、その会社の沿革をまとめ直す（画面は待たせない）
  const companyId = f.owner_company_id;
  after(async () => {
    await summarizeVaultFile(fileId);
    await rebuildCompanyHistory(companyId);
  });
  revalidatePath("/admin/vault");
  return { ok: true };
}

/** 削除（台帳には「削除」として残し、保存場所からは消す） */
export async function deleteVaultFile(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED };
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("path, owner_company_id, name, category").eq("id", fileId).maybeSingle();
  if (!f?.owner_company_id) return { error: "ファイルが見つかりません" };
  await admin.storage.from(BUCKET).remove([f.path]);
  await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", fileId);
  await audit({ actor: me.id, action: "delete", targetType: "company_file", targetId: fileId, detail: { company: f.owner_company_id, category: f.category, name: f.name } });
  const companyId = f.owner_company_id;
  after(() => rebuildCompanyHistory(companyId));
  revalidatePath("/admin/vault");
  return { ok: true };
}

/** AI に読み直させる（読めなかったとき・書類の日付やメモを直したとき） */
export async function resummarizeVaultFile(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED };
  const { data: f } = await createAdminClient().from("files").select("owner_company_id").eq("id", fileId).eq("status", "ready").maybeSingle();
  if (!f?.owner_company_id) return { error: "ファイルが見つかりません" };
  await createAdminClient().from("files").update({ ai_summary: null, ai_error: null, ai_summarized_at: null }).eq("id", fileId);
  const companyId = f.owner_company_id;
  after(async () => {
    await summarizeVaultFile(fileId);
    await rebuildCompanyHistory(companyId);
  });
  revalidatePath("/admin/vault");
  return { ok: true };
}
