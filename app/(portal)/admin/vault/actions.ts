"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { rebuildCompanyHistory } from "@/lib/ai-guide/vault-ai";
import { ingestFile } from "@/lib/data-store/ingest";
import { runMaintenance } from "@/lib/data-store/maintenance";
import { importAirRegiBuffer } from "@/lib/pos/import-airregi";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BUCKET, VAULT_MAX_BYTES, VAULT_TYPES, canUseVault, isVaultCategory, newPath, properFileName, signedUploadFor } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

const DENIED = "会社の書類は、経理・総務の担当だけが扱えます";
export type VaultStart = { fileId: string; path: string; token: string } | { error: string };

/**
 * 会社の書類のアップロードの準備（台帳に「準備中」で登録し、1回だけ使えるアップロードURLを返す）。
 * 会社・種類は "auto" なら AI に振り分けてもらう（会社はいったんホールディングスに置き、AI が読んだあとで移す）
 */
export async function startVaultUpload(input: { companyId: string; category: string; name: string; contentType: string; size: number; docDate: string; note: string }): Promise<VaultStart> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED };
  const autoCategory = input.category === "auto";
  const autoCompany = input.companyId === "auto";
  if (!autoCategory && !isVaultCategory(input.category)) return { error: "書類の種類を選んでください" };
  if (!(input.contentType in VAULT_TYPES)) return { error: "PDF・写真・Excel・Word・CSV を選んでください" };
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > VAULT_MAX_BYTES) return { error: "50MB以下のファイルを選んでください" };
  if (input.docDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.docDate)) return { error: "日付が正しくありません" };
  const admin = createAdminClient();
  const { data: company } = autoCompany
    ? await admin.from("companies").select("id").eq("is_active", true).order("sort_order").limit(1).maybeSingle()
    : await admin.from("companies").select("id").eq("id", input.companyId).maybeSingle();
  if (!company) return { error: "会社を選んでください" };
  const category = autoCategory ? "corp_other" : input.category;

  const path = newPath(category as Parameters<typeof newPath>[0], "company", input.contentType);
  const { data, error } = await admin
    .from("files")
    .insert({
      path,
      category,
      ai_auto_category: autoCategory,
      ai_auto_company: autoCompany,
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
  // 返事のあとで、AI が中身を読んで振り分け・要約し、その会社の沿革をまとめ直す（画面は待たせない）
  after(() => ingestFile(fileId));
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
  after(() => ingestFile(fileId));
  revalidatePath("/admin/vault");
  return { ok: true };
}

export type FixState = { ok?: string; error?: string; at?: number } | undefined;

/** AI の振り分けを人が直す（会社・種類・書類の名前・日付・メモ）。直した欄は、もう AI に上書きさせない */
export async function fixVaultFile(fileId: string, _prev: FixState, fd: FormData): Promise<FixState> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED, at: Date.now() };
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("owner_company_id").eq("id", fileId).eq("status", "ready").maybeSingle();
  if (!f?.owner_company_id) return { error: "ファイルが見つかりません", at: Date.now() };
  const companyId = String(fd.get("company_id") ?? "");
  const category = String(fd.get("category") ?? "");
  const docDate = String(fd.get("doc_date") ?? "");
  const { data: company } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return { error: "会社を選んでください", at: Date.now() };
  if (!isVaultCategory(category)) return { error: "種類を選んでください", at: Date.now() };
  if (docDate && !/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return { error: "日付が正しくありません", at: Date.now() };
  const docKind = String(fd.get("doc_kind") ?? "").trim().slice(0, 60) || null;
  const { data: cur } = await admin.from("files").select("name").eq("id", fileId).single();
  const { data: cname } = await admin.from("companies").select("name").eq("id", company.id).single();
  await admin
    .from("files")
    .update({
      owner_company_id: company.id,
      category,
      doc_kind: docKind,
      doc_date: docDate || null,
      // 直した内容に合わせて、ファイル名も付け直す（表のデータは今の名前のまま）
      ...(category === "corp_data" ? {} : { name: properFileName({ original: cur?.name ?? "", docKind, docDate: docDate || null, companyName: cname?.name }) }),
      note: String(fd.get("note") ?? "").trim().slice(0, 500) || null,
      ai_auto_company: false,
      ai_auto_category: false,
      ai_error: null,
    })
    .eq("id", fileId);
  await audit({ actor: me.id, action: "update", targetType: "company_file", targetId: fileId, detail: { company: company.id, category } });
  const before = f.owner_company_id;
  after(async () => {
    await rebuildCompanyHistory(company.id);
    if (before !== company.id) await rebuildCompanyHistory(before);
  });
  revalidatePath("/admin/vault");
  return { ok: "直しました", at: Date.now() };
}

export type ReviewState = { ok?: string; error?: string; at?: number } | undefined;

/** エアレジの CSV を、選んだ店の売上として取り込む（公式の数字に入れる） */
export async function applyPosDataset(datasetId: string, _prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED, at: Date.now() };
  const storeId = String(fd.get("store_id") ?? "");
  if (!storeId) return { error: "店を選んでください", at: Date.now() };
  const admin = createAdminClient();
  const { data: ds } = await admin.from("datasets").select("id, file_id, kind, official_status").eq("id", datasetId).maybeSingle();
  if (!ds || ds.kind !== "pos_airregi") return { error: "見つかりません", at: Date.now() };
  const { data: f } = await admin.from("files").select("path, name").eq("id", ds.file_id).single();
  const { data: blob } = await admin.storage.from(BUCKET).download(f!.path);
  if (!blob) return { error: "ファイルを読み出せませんでした", at: Date.now() };
  const r = await importAirRegiBuffer({ storeId, fileName: f!.name, buf: Buffer.from(await blob.arrayBuffer()), importedBy: me.id });
  if ("error" in r) return { error: r.error, at: Date.now() };
  await admin.from("datasets").update({ store_id: storeId, status: "ready", review_reason: null, official_status: "applied", reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", datasetId);
  await audit({ actor: me.id, action: "create", targetType: "pos_import", targetId: storeId, detail: { dataset: datasetId, message: r.ok } });
  revalidatePath("/admin/vault");
  revalidatePath("/admin/sales");
  return { ok: r.ok, at: Date.now() };
}

const FIN_KEYS = ["revenue", "gross_profit", "operating_income", "ordinary_income", "net_income", "total_assets", "net_assets", "borrowings", "cash"] as const;

/** AI が読み取った決算の数字を、人が確かめて（直して）公式にする */
export async function approveFinancials(statementId: string, _prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const me = await requireAdmin();
  if (!canUseVault(me)) return { error: DENIED, at: Date.now() };
  const values: Record<string, number | null> = {};
  for (const k of FIN_KEYS) {
    const raw = String(fd.get(k) ?? "").replace(/[,\s円]/g, "");
    if (raw === "") values[k] = null;
    else if (/^-?\d+$/.test(raw)) values[k] = Number(raw);
    else return { error: "数字は円の整数で入れてください", at: Date.now() };
  }
  const admin = createAdminClient();
  const { data: st } = await admin.from("financial_statements").update({ ...values, approved: true, approved_by: me.id, approved_at: new Date().toISOString() }).eq("id", statementId).select("dataset_id").single();
  if (st?.dataset_id) await admin.from("datasets").update({ status: "ready", review_reason: null, official_status: "applied", reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", st.dataset_id);
  await audit({ actor: me.id, action: "update", targetType: "financial_statement", targetId: statementId, detail: { approved: true } });
  revalidatePath("/admin/vault");
  return { ok: "決算の数字を確かめました（公式の数字になりました）", at: Date.now() };
}

/** 公式に入れない（このデータは参考としてだけ残す） */
export async function rejectOfficial(datasetId: string) {
  const me = await requireAdmin();
  if (!canUseVault(me)) throw new Error(DENIED);
  await createAdminClient().from("datasets").update({ status: "ready", review_reason: null, official_status: "rejected", reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", datasetId);
  revalidatePath("/admin/vault");
}

/** 今すぐ整理する（ふだんは毎月1日の朝に自動） */
export async function runMaintenanceNow(): Promise<void> {
  const me = await requireAdmin();
  if (!canUseVault(me)) throw new Error(DENIED);
  await runMaintenance();
  revalidatePath("/admin/vault");
}
