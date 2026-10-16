"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { audit } from "@/lib/audit";
import { pushLine } from "@/lib/line-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReviewState = { ok?: string; error?: string; at?: number } | undefined;

/**
 * シフトなしの出勤・残業を、店長が承認／却下する（その店を見られる人だけ）。
 * 却下したシフトなしの出勤は給与に入れない。残業は承認した分だけ給与に入る。結果は本人に LINE で知らせる
 */
export async function reviewAttendance(id: string, kind: "noshift" | "overtime", decision: "approved" | "rejected", _prev: ReviewState): Promise<ReviewState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: a } = await admin.from("attendance").select("id, staff_id, store_id, date, noshift_status, overtime_status, overtime_minutes").eq("id", id).maybeSingle();
  if (!a) return { error: "記録が見つかりません", at: Date.now() };
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, a.store_id)) return { error: "この店の承認はできません", at: Date.now() };
  if (a.staff_id === me.id) return { error: "自分の分は承認できません。ほかの店長・本部に頼んでください", at: Date.now() };
  const now = new Date().toISOString();
  const update =
    kind === "noshift"
      ? { noshift_status: decision, noshift_reviewed_by: me.id, noshift_reviewed_at: now }
      : { overtime_status: decision, overtime_reviewed_by: me.id, overtime_reviewed_at: now };
  const { error } = await admin.from("attendance").update(update).eq("id", id);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "attendance", targetId: id, subject: a.staff_id, detail: { kind, decision } });

  // 本人に知らせる
  const { data: who } = await admin.from("staff").select("line_user_id").eq("id", a.staff_id).single();
  const md = `${Number(a.date.slice(5, 7))}/${Number(a.date.slice(8, 10))}`;
  const text =
    kind === "noshift"
      ? `【シフトなしの出勤】${md} の出勤は${decision === "approved" ? "承認されました" : "却下されました（この日の勤務は給与に入りません。違う場合は店長に伝えてください）"}`
      : `【残業】${md} の残業 ${a.overtime_minutes ?? 0}分は${decision === "approved" ? "承認されました（給与に入ります）" : "承認されませんでした（シフトの終わりまでで数えます）"}`;
  await pushLine([who?.line_user_id], text, "report");
  revalidatePath(`/attendance/review/${id}`);
  revalidatePath("/attendance");
  return { ok: decision === "approved" ? "承認しました。本人に LINE で知らせました" : "却下しました。本人に LINE で知らせました", at: Date.now() };
}
