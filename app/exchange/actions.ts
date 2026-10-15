"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BUCKET, VAULT_MAX_BYTES, VAULT_TYPES, newPath, signedUploadFor } from "@/lib/files";
import { endPartnerSession, logPartner, requirePartner } from "@/lib/partner-auth";
import { notifyCeo } from "@/lib/partner-data";
import { createAdminClient } from "@/lib/supabase/admin";

export async function partnerLogout() {
  await endPartnerSession();
  redirect("/exchange/login");
}

export type BankStart = { fileId: string; path: string; token: string } | { error: string };

/** 銀行から書類を入れる準備（その銀行の書類として台帳に登録し、1回だけ使えるアップロードURLを返す） */
export async function startBankUpload(input: { name: string; contentType: string; size: number; note: string }): Promise<BankStart> {
  const me = await requirePartner();
  if (!(input.contentType in VAULT_TYPES)) return { error: "PDF・写真・Excel・Word・CSV を選んでください" };
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > VAULT_MAX_BYTES) return { error: "50MB以下のファイルを選んでください" };
  const admin = createAdminClient();
  // 台帳の「入れた人」は社員を指すので、代表を入れておき、本当の入れた人は記録と owner_partner_id で分かるようにする
  const ceo = process.env.CEO_STAFF_ID;
  if (!ceo) return { error: "今は受け付けられません" };
  const path = newPath("corp_bank", `partner-${me.partnerId}`, input.contentType);
  const { data, error } = await admin
    .from("files")
    .insert({
      path,
      category: "corp_bank",
      owner_staff_id: null,
      owner_partner_id: me.partnerId,
      name: input.name.slice(0, 200) || "ファイル",
      content_type: input.contentType,
      size_bytes: input.size,
      visible_to_owner: false,
      note: `${me.partnerName} ${me.name}様より${input.note.trim() ? `：${input.note.trim().slice(0, 300)}` : ""}`,
      uploaded_by: ceo,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "受け付けられませんでした" };
  const signed = await signedUploadFor(path);
  return { fileId: data.id, path, token: signed.token };
}

export async function finishBankUpload(fileId: string): Promise<{ ok: true } | { error: string }> {
  const me = await requirePartner();
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("path, owner_partner_id, status, name").eq("id", fileId).maybeSingle();
  if (!f || f.owner_partner_id !== me.partnerId || f.status !== "pending") return { error: "確認できませんでした" };
  const { data: exists } = await admin.storage.from(BUCKET).exists(f.path);
  if (!exists) return { error: "ファイルが届いていません。もう一度お試しください" };
  await admin.from("files").update({ status: "ready" }).eq("id", fileId);
  await logPartner({ partnerId: me.partnerId, userId: me.id, action: "upload", target: f.name });
  await notifyCeo(`【資料閲覧】${me.partnerName} ${me.name}様から書類が届きました：${f.name}\nIH ポータル → 取引先（銀行）で見られます`);
  revalidatePath("/exchange");
  return { ok: true };
}
