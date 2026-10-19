"use server";

import { businessDayJST } from "@/lib/business-day";
import { consumeToken, punchStatus, verifyTicket, type PunchAction } from "@/lib/punch";
import { createAdminClient } from "@/lib/supabase/admin";
import { checklistFor, confirmNotice, pendingNotices } from "@/lib/workboard";
import { headers } from "next/headers";
import { OVERTIME_CATEGORIES, checkInFrom, hhmmJST, notifyReview, overtimeAt, shiftOn } from "@/lib/punch-rules";

/** LINE に載せる承認画面のアドレスの元（このサイトのアドレス） */
async function originOf() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

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
    // シフトがある日は、シフト開始の15分前から（2026-10-16 黒田さん決定）
    const day = businessDayJST();
    const shift = await shiftOn(t.staffId, day);
    const from = checkInFrom(shift);
    if (from !== null && Date.now() < from) return { ok: false, error: `今日のシフトは ${shift!.startText} からです。出勤は ${hhmmJST(from)} から押せます` };
    const used = await consumeToken(t.token, t.staffId, "check_in");
    if (!used) return { ok: false, error: EXPIRED };
    const now = new Date();
    const { data: row, error } = await admin
      .from("attendance")
      .insert({
        staff_id: t.staffId,
        store_id: used.store_id,
        date: businessDayJST(now),
        checkin_time: now.toISOString(),
        checkin_token_id: used.id,
        // シフトがない日の出勤は記録して、店長に承認・却下してもらう
        ...(shift ? {} : { no_shift: true, noshift_status: "pending" }),
      })
      .select("id")
      .single();
    if (error || !row) {
      console.error("check_in failed", error);
      return { ok: false, error: "出勤を記録できませんでした。店長に伝えて、打刻修正で直してください" };
    }
    if (!shift) {
      const { data: me } = await admin.from("staff").select("name").eq("id", t.staffId).single();
      const { data: store } = await admin.from("stores").select("name").eq("id", used.store_id).single();
      await notifyReview({ attendanceId: row.id, kind: "noshift", storeId: used.store_id, staffId: t.staffId, staffName: me?.name ?? "", detail: `${store?.name ?? ""} ${hhmmJST(now.getTime())} 出勤`, origin: await originOf() });
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
  // シフトの終わりから15分以上なら、残業の理由（選ぶ＋書く）が要る（2026-10-16 黒田さん決定）
  const { data: att } = await admin.from("attendance").select("date, store_id").eq("id", status.attendanceId).single();
  const shift = att ? await shiftOn(t.staffId, att.date) : null;
  const over = overtimeAt(shift, Date.now());
  const category = String(fd.get("overtime_category") ?? "");
  const reason = String(fd.get("overtime_reason") ?? "").trim();
  if (over !== null) {
    if (!(OVERTIME_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "残業の理由を選んでください" };
    if (!reason) return { ok: false, error: "残業の理由を書いてください" };
  }
  const used = await consumeToken(t.token, t.staffId, "check_out");
  if (!used) return { ok: false, error: EXPIRED };
  const now = new Date();
  const overNow = overtimeAt(shift, now.getTime());
  const { error } = await admin
    .from("attendance")
    .update({
      checkout_time: now.toISOString(),
      break_minutes: breakMinutes,
      checkout_token_id: used.id,
      ...(overNow !== null ? { overtime_minutes: overNow, overtime_category: category, overtime_reason: reason.slice(0, 300), overtime_status: "pending" } : {}),
    })
    .eq("id", status.attendanceId)
    .is("checkout_time", null);
  if (error) {
    console.error("check_out failed", error);
    return { ok: false, error: "退勤を記録できませんでした。店長に伝えて、打刻修正で直してください" };
  }
  if (items.length) {
    await admin.from("workboard_checklist_logs").insert({ attendance_id: status.attendanceId, staff_id: t.staffId, store_id: used.store_id, items: items.map((i) => ({ id: i.id, label: i.label })) });
  }
  if (overNow !== null && att) {
    const { data: me } = await admin.from("staff").select("name").eq("id", t.staffId).single();
    await notifyReview({
      attendanceId: status.attendanceId,
      kind: "overtime",
      storeId: att.store_id,
      staffId: t.staffId,
      staffName: me?.name ?? "",
      detail: `${overNow}分の残業です（シフト〜${shift!.endText}・退勤 ${hhmmJST(now.getTime())}）\n理由：${category}／${reason.slice(0, 100)}`,
      origin: await originOf(),
    });
  }
  return { ok: true, action, at: now.toISOString() };
}

/** ワークボードのお知らせを「確認しました」にする（打刻の確認画面から。本人の札で確かめる） */
export async function confirmPunchNotice(ticket: string, noticeId: string): Promise<{ ok: boolean; error?: string }> {
  const t = verifyTicket(ticket);
  if (!t) return { ok: false, error: EXPIRED };
  return (await confirmNotice(t.staffId, noticeId)) ? { ok: true } : { ok: false, error: "記録できませんでした。もう一度押してください" };
}
