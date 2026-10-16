"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { audit } from "@/lib/audit";
import { pushLine } from "@/lib/line-push";
import { addDays, rangeText } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";

export type LeaveReviewState = { ok?: string; error?: string; at?: number } | undefined;
const fail = (error: string): LeaveReviewState => ({ error, at: Date.now() });

/**
 * 有給の申請を、店長が承認／却下する（その店を見られる人だけ。自分の分はできない）。
 * 承認すると、その期間のシフトに「有給」を入れる（公休の日はそのまま）。結果は本人に LINE で知らせる
 */
export async function reviewLeave(id: string, decision: "approved" | "rejected", _prev: LeaveReviewState, form: FormData): Promise<LeaveReviewState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: r } = await admin.from("paid_leave_requests").select("*").eq("id", id).maybeSingle();
  if (!r) return fail("申請が見つかりません");
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, r.store_id)) return fail("この店の承認はできません");
  if (r.staff_id === me.id) return fail("自分の分は承認できません。ほかの店長・本部に頼んでください");
  if (r.status !== "pending") return fail("この申請はもう処理されています");
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;

  if (decision === "approved") {
    const { data: existing } = await admin.from("shift_schedule").select("work_date, shift_type, store_id").eq("staff_id", r.staff_id).gte("work_date", r.start_date).lte("work_date", r.end_date);
    const off = new Set((existing ?? []).filter((s) => s.shift_type === "off").map((s) => s.work_date));
    const rows = [];
    for (let d = r.start_date; d <= r.end_date; d = addDays(d, 1)) {
      if (off.has(d)) continue;
      const other = existing?.find((s) => s.work_date === d);
      rows.push({ staff_id: r.staff_id, store_id: other?.store_id ?? r.store_id, work_date: d, shift_type: "paid_leave", planned_start: null, planned_end: null, work_role: null, updated_by: me.id, updated_at: new Date().toISOString() });
    }
    const { error } = rows.length ? await admin.from("shift_schedule").upsert(rows, { onConflict: "staff_id,work_date" }) : { error: null };
    if (error) return fail("シフトに入れられませんでした");
  }
  const { error } = await admin
    .from("paid_leave_requests")
    .update({ status: decision, reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return fail("保存できませんでした");
  await audit({ actor: me.id, action: "update", targetType: "paid_leave_request", targetId: id, subject: r.staff_id, detail: { decision } });

  const { data: who } = await admin.from("staff").select("line_user_id").eq("id", r.staff_id).single();
  await pushLine(
    [who?.line_user_id],
    `【有給】${rangeText(r.start_date, r.end_date)}（${r.days}日）の申請は${decision === "approved" ? "承認されました。シフトに「有給」が入りました" : "承認されませんでした"}${note ? `\n店長から：${note}` : ""}`,
    "report",
  );
  revalidatePath(`/leave/review/${id}`);
  revalidatePath("/leave/review");
  revalidatePath("/me/leave");
  return { ok: decision === "approved" ? "承認しました。シフトに「有給」を入れ、本人に LINE で知らせました" : "却下しました。本人に LINE で知らせました", at: Date.now() };
}
