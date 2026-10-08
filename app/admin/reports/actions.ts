"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { pushLine } from "@/lib/line-push";
import { reportType } from "@/lib/reports/registry";
import { ApplyError } from "@/lib/reports/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReviewState = { ok?: string; error?: string; at?: number } | undefined;

/** ハラスメントの相談は、特別管理者だけが処理できる */
async function canReview(permission: string | null, reportId: string) {
  const { data } = await createAdminClient().from("reports").select("category").eq("id", reportId).maybeSingle();
  return !!data && (data.category !== "harassment" || permission === "superadmin");
}

async function notify(reportId: string, text: (summary: string) => string) {
  const admin = createAdminClient();
  const { data: r } = await admin.from("reports").select("type, payload, reporter_id, subject_staff_id").eq("id", reportId).single();
  if (!r) return;
  const ids = [r.reporter_id, r.subject_staff_id].filter(Boolean);
  const { data: people } = await admin.from("staff").select("id, name, line_user_id, retired").in("id", ids);
  const subject = people?.find((p) => p.id === r.subject_staff_id)?.name;
  const summary = reportType(r.type)?.summary(r.payload, { subject }) ?? "";
  await pushLine((people ?? []).filter((p) => !p.retired).map((p) => p.line_user_id), text(summary));
}

/**
 * 承認。先に「確認中→承認済み」を条件付きで押さえてから反映する（二重に押しても1回だけ反映される）。
 * 反映できなければ確認中に戻して、理由を画面に出す
 */
export async function approveReport(reportId: string, _prev: ReviewState): Promise<ReviewState> {
  const me = await requireAdmin();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (!(await canReview(me.permission, reportId))) return { error: "この報告を処理する権限がありません", at: Date.now() };
  const { data: claimed } = await admin
    .from("reports")
    .update({ status: "approved", reviewed_by: me.id, reviewed_at: now })
    .eq("id", reportId)
    .eq("status", "pending")
    .select("id, type, store_id, reporter_id, payload")
    .maybeSingle();
  if (!claimed) return { error: "この報告はすでに処理されています", at: Date.now() };

  const type = reportType(claimed.type);
  try {
    if (!type) throw new ApplyError("この報告の種類は、今は処理できません");
    const applied = await type.apply({
      reportId,
      storeId: claimed.store_id,
      reporterId: claimed.reporter_id,
      reviewerId: me.id,
      payload: claimed.payload,
    });
    await admin.from("reports").update({ applied }).eq("id", reportId);
  } catch (e) {
    await admin.from("reports").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", reportId);
    if (e instanceof ApplyError) return { error: e.message, at: Date.now() };
    console.error("approveReport failed", e);
    return { error: "反映に失敗しました。時間をおいてもう一度お試しください", at: Date.now() };
  }

  await notify(reportId, (s) => `【IKKOU HOLDINGS 本部】報告を受け付けました（${type?.approveLabel ?? "承認・反映済み"}）。\n${s}`);
  revalidatePath("/admin/reports");
  revalidatePath("/attendance");
  return { ok: "承認して反映しました", at: Date.now() };
}

export async function rejectReport(reportId: string, _prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const me = await requireAdmin();
  if (!(await canReview(me.permission, reportId))) return { error: "この報告を処理する権限がありません", at: Date.now() };
  const note = String(fd.get("note") ?? "").trim().slice(0, 200);
  if (!note) return { error: "却下の理由を入力してください", at: Date.now() };
  const { data } = await createAdminClient()
    .from("reports")
    .update({ status: "rejected", review_note: note, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!data) return { error: "この報告はすでに処理されています", at: Date.now() };
  await notify(reportId, (s) => `【IKKOU HOLDINGS 本部】報告が却下されました。\n${s}\n理由：${note}`);
  revalidatePath("/admin/reports");
  return { ok: "却下しました", at: Date.now() };
}
