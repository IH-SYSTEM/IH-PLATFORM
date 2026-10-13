"use server";

import { businessDayJST } from "@/lib/business-day";
import { consumeToken, punchStatus, verifyTicket, type PunchAction } from "@/lib/punch";
import { createAdminClient } from "@/lib/supabase/admin";
import { checklistFor, confirmNotice, pendingNotices } from "@/lib/workboard";

export type PunchResult = { ok: true; action: PunchAction; at: string } | { ok: false; error: string } | undefined;

const EXPIRED = "確認画面の有効期限が切れました。店内の画面のQRを、もう一度読み取ってください";

/**
 * 出勤・退勤の打刻。打刻は「記録」なので時刻は丸めずに実時刻で残す（15分丸めは給与計算側）。
 * 先に状態を確かめてからトークンを使い切る（二重出勤で掲示のQRを無駄にしない）
 */
export async function punch(ticket: string, action: PunchAction, _prev: PunchResult, fd: FormData): Promise<PunchResult> {
  const t = verifyTicket(ticket);
  if (!t) return { ok: false, error: EXPIRED };
  const admin = createAdminClient();
  const status = await punchStatus(t.staffId);

  // ワークボード：その打刻の前のお知らせを全部確認していなければ止める（画面を飛ばして送られても、ここで止まる）
  const { data: tok } = await admin.from("punch_tokens").select("store_id").eq("token", t.token).maybeSingle();
  const pending = await pendingNotices({ staffId: t.staffId, storeId: tok?.store_id ?? null, timing: action, today: businessDayJST() });
  if (pending.length) return { ok: false, error: `まだ確認していないお知らせが${pending.length}件あります。確認してから押してください` };

  if (action === "check_in") {
    if (status.kind !== "before_checkin") return { ok: false, error: "すでに出勤しています" };
    const used = await consumeToken(t.token, t.staffId, "check_in");
    if (!used) return { ok: false, error: EXPIRED };
    const now = new Date();
    const { error } = await admin.from("attendance").insert({
      staff_id: t.staffId,
      store_id: used.store_id,
      date: businessDayJST(now),
      checkin_time: now.toISOString(),
      checkin_token_id: used.id,
    });
    if (error) {
      console.error("check_in failed", error);
      return { ok: false, error: "出勤を記録できませんでした。店長に伝えて、打刻修正で直してください" };
    }
    return { ok: true, action, at: now.toISOString() };
  }

  if (status.kind !== "working") return { ok: false, error: "出勤の記録がないため、退勤できません" };
  const breakMinutes = Number(fd.get("break_minutes") ?? 0);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return { ok: false, error: "休憩時間の値が正しくありません" };
  // 退勤チェックリスト：全部にチェックが入っていなければ止める
  const items = await checklistFor(tok?.store_id ?? null);
  const checked = new Set(fd.getAll("checklist").map(String));
  if (items.some((i) => !checked.has(i.id))) return { ok: false, error: "退勤チェックリストを全部済ませてから押してください" };
  const used = await consumeToken(t.token, t.staffId, "check_out");
  if (!used) return { ok: false, error: EXPIRED };
  const now = new Date();
  const { error } = await admin
    .from("attendance")
    .update({ checkout_time: now.toISOString(), break_minutes: breakMinutes, checkout_token_id: used.id })
    .eq("id", status.attendanceId)
    .is("checkout_time", null);
  if (error) {
    console.error("check_out failed", error);
    return { ok: false, error: "退勤を記録できませんでした。店長に伝えて、打刻修正で直してください" };
  }
  if (items.length) {
    await admin.from("workboard_checklist_logs").insert({ attendance_id: status.attendanceId, staff_id: t.staffId, store_id: used.store_id, items: items.map((i) => ({ id: i.id, label: i.label })) });
  }
  return { ok: true, action, at: now.toISOString() };
}

/** ワークボードのお知らせを「確認しました」にする（打刻の確認画面から。本人の札で確かめる） */
export async function confirmPunchNotice(ticket: string, noticeId: string): Promise<{ ok: boolean; error?: string }> {
  const t = verifyTicket(ticket);
  if (!t) return { ok: false, error: EXPIRED };
  return (await confirmNotice(t.staffId, noticeId)) ? { ok: true } : { ok: false, error: "記録できませんでした。もう一度押してください" };
}
