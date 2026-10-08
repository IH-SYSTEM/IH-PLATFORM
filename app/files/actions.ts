"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ALLOWED_TYPES, BUCKET, isFileCategory, MAX_BYTES, newPath, signedUploadFor, type FileCategory } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

// スタッフが自分で出せる書類。雇用契約書・源泉徴収票は会社が出すもの（管理者だけがアップロードできる）
const SELF_UPLOAD: FileCategory[] = ["tax_certificate", "receipt", "report", "other"];

export type StartUpload = { fileId: string; path: string; token: string } | { error: string };

/**
 * アップロードの準備。権限と種類・容量を確かめ、台帳に「準備中」で登録し、1回だけ使えるアップロードURLを返す。
 * ファイル本体はブラウザから保存場所へ直接送る（Vercel の4.5MB制限を通らないように）
 */
export async function startUpload(input: {
  category: string;
  ownerStaffId: string | null;
  name: string;
  contentType: string;
  size: number;
  visibleToOwner?: boolean;
}): Promise<StartUpload> {
  const me = await requireStaff();
  if (!isFileCategory(input.category)) return { error: "書類の種類が正しくありません" };
  if (!(input.contentType in ALLOWED_TYPES)) return { error: "写真（JPEG・PNG・HEIC）かPDFを選んでください" };
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_BYTES) return { error: "10MB以下のファイルを選んでください" };
  const owner = input.ownerStaffId;
  if (!me.isAdmin && (owner !== me.id || !SELF_UPLOAD.includes(input.category))) return { error: "この書類はアップロードできません" };

  const path = newPath(input.category, owner, input.contentType);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("files")
    .insert({
      path,
      category: input.category,
      owner_staff_id: owner,
      name: input.name.slice(0, 200) || "ファイル",
      content_type: input.contentType,
      size_bytes: input.size,
      visible_to_owner: me.isAdmin ? input.visibleToOwner !== false : true,
      uploaded_by: me.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("startUpload failed", error);
    return { error: "アップロードを準備できませんでした" };
  }
  const signed = await signedUploadFor(path);
  return { fileId: data.id, path, token: signed.token };
}

/** アップロードの完了。保存場所に本当に届いたことを確かめてから「使える」にする */
export async function finishUpload(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("id, path, owner_staff_id, category, name, uploaded_by, status").eq("id", fileId).maybeSingle();
  if (!f || f.uploaded_by !== me.id || f.status !== "pending") return { error: "アップロードを確認できませんでした" };
  const { data: exists } = await admin.storage.from(BUCKET).exists(f.path);
  if (!exists) return { error: "ファイルが届いていません。もう一度お試しください" };
  await admin.from("files").update({ status: "ready" }).eq("id", fileId);
  await audit({ actor: me.id, action: "upload", targetType: "file", targetId: fileId, subject: f.owner_staff_id, detail: { category: f.category, name: f.name } });
  revalidatePath("/me/documents");
  if (f.owner_staff_id) revalidatePath(`/admin/staff/${f.owner_staff_id}`);
  return { ok: true };
}

/** 削除（管理者のみ）。台帳には「削除」として残し、保存場所からは消す */
export async function deleteFile(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requireStaff();
  if (!me.isAdmin) return { error: "削除する権限がありません" };
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("path, owner_staff_id, name, category").eq("id", fileId).maybeSingle();
  if (!f) return { error: "ファイルが見つかりません" };
  await admin.storage.from(BUCKET).remove([f.path]);
  await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", fileId);
  await audit({ actor: me.id, action: "delete", targetType: "file", targetId: fileId, subject: f.owner_staff_id, detail: { category: f.category, name: f.name } });
  if (f.owner_staff_id) revalidatePath(`/admin/staff/${f.owner_staff_id}`);
  return { ok: true };
}
