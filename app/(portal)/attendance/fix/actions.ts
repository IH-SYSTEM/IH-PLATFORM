"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { cannotReviewFix } from "@/lib/attendance-fix";
import { audit } from "@/lib/audit";
import { pushLine } from "@/lib/line-push";
import { reportType } from "@/lib/reports/registry";
import { ApplyError } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type FixState = { ok?: string; error?: string; at?: number } | undefined;

async function tell(reportId: string, text: string) {
  const admin = createAdminClient();
  const { data: r } = await admin.from("reports").select("reporter_id, subject_staff_id").eq("id", reportId).single();
  const ids = [...new Set([r?.reporter_id, r?.subject_staff_id].filter(Boolean))] as string[];
  const { data: people } = ids.length ? await admin.from("staff").select("line_user_id, retired").in("id", ids) : { data: [] };
  await pushLine((people ?? []).filter((p) => !p.retired).map((p) => p.line_user_id), text, "report");
}

/** 承認：先に「確認中→承認済み」を押さえてから勤怠に反映する（二重に押しても1回だけ）。反映できなければ確認中に戻す */
export async function approveFix(reportId: string, _prev: FixState, _fd: FormData): Promise<FixState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: r } = await admin.from("reports").select("id, type, store_id, reporter_id, subject_staff_id, payload, status").eq("id", reportId).maybeSingle();
  if (!r) return { error: "依頼が見つかりません", at: Date.now() };
  const denied = await cannotReviewFix(me, r);
  if (denied) return { error: denied, at: Date.now() };
  const now = new Date().toISOString();
  const { data: claimed } = await admin.from("reports").update({ status: "approved", reviewed_by: me.id, reviewed_at: now }).eq("id", reportId).eq("status", "pending").select("id").maybeSingle();
  if (!claimed) return { error: "この依頼はすでに処理されています", at: Date.now() };
  const type = reportType(r.type)!;
  try {
    const applied = await type.apply({ reportId, storeId: r.store_id, reporterId: r.reporter_id, reviewerId: me.id, payload: r.payload });
    await admin.from("reports").update({ applied }).eq("id", reportId);
  } catch (e) {
    await admin.from("reports").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", reportId);
    if (e instanceof ApplyError) return { error: e.message, at: Date.now() };
    console.error("approveFix failed", e);
    return { error: "反映できませんでした。時間をおいてもう一度押してください", at: Date.now() };
  }
  const { data: subj } = r.subject_staff_id ? await admin.from("staff").select("name").eq("id", r.subject_staff_id).single() : { data: null };
  await tell(reportId, `【打刻の修正】承認され、勤怠に反映しました（承認：${me.name}さん）\n${type.summary(r.payload, { subject: subj?.name })}`);
  revalidatePath(`/attendance/fix/${reportId}`);
  revalidatePath("/attendance");
  return { ok: "承認して、勤怠に反映しました。本人に LINE で知らせました", at: Date.now() };
}

/** 却下（理由つき）。本人と依頼した人に LINE */
export async function rejectFix(reportId: string, _prev: FixState, fd: FormData): Promise<FixState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const note = String(fd.get("note") ?? "").trim().slice(0, 200);
  if (!note) return { error: "却下の理由を書いてください", at: Date.now() };
  const { data: r } = await admin.from("reports").select("id, type, store_id, subject_staff_id, payload").eq("id", reportId).maybeSingle();
  if (!r) return { error: "依頼が見つかりません", at: Date.now() };
  const denied = await cannotReviewFix(me, r);
  if (denied) return { error: denied, at: Date.now() };
  const { data: done } = await admin
    .from("reports")
    .update({ status: "rejected", reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", reportId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!done) return { error: "この依頼はすでに処理されています", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "report", targetId: reportId, detail: { reject: note } });
  const { data: subj } = r.subject_staff_id ? await admin.from("staff").select("name").eq("id", r.subject_staff_id).single() : { data: null };
  await tell(reportId, `【打刻の修正】依頼は承認されませんでした（${me.name}さん）\n理由：${note}\n${reportType(r.type)?.summary(r.payload, { subject: subj?.name }) ?? ""}`);
  revalidatePath(`/attendance/fix/${reportId}`);
  revalidatePath("/attendance");
  return { ok: "却下しました。本人に LINE で知らせました", at: Date.now() };
}
