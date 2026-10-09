"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { findAttendance, pick, recordEdit, SNAPSHOT_COLUMNS, type AttendanceSnapshot } from "@/lib/attendance-write";
import { jstCheckoutToISO, jstDateTimeToISO } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";
import { EDIT_REASONS } from "./reasons";

export type EditState = { error?: string; at?: number } | undefined;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 本部の打刻修正。出勤・退勤・休憩を直し、理由と変更前後を履歴に残す。
 * 退勤の「00:30」は、出勤より前なら翌日として保存する（jstCheckoutToISO を必ず通す）
 */
export async function saveAttendance(attendanceId: string | null, _prev: EditState, fd: FormData): Promise<EditState> {
  const me = await requireAdmin();
  const admin = createAdminClient();
  const fail = (error: string) => ({ error, at: Date.now() });
  const get = (k: string) => String(fd.get(k) ?? "").trim();

  const reason = get("reason");
  if (!(EDIT_REASONS as readonly string[]).includes(reason)) return fail("理由を選んでください");
  const note = get("note").slice(0, 200) || null;
  const inTime = get("checkin");
  const outTime = get("checkout");
  const breakMinutes = Number(get("break_minutes") || 0);
  if (inTime && !TIME.test(inTime)) return fail("出勤時刻は「19:30」の形式で入力してください");
  if (outTime && !TIME.test(outTime)) return fail("退勤時刻は「00:30」の形式で入力してください");
  if (!inTime) return fail("出勤時刻を入力してください（記録ごと消す場合は「この記録を削除」を使います）");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return fail("休憩は0〜600分で入力してください");

  let before: AttendanceSnapshot | null = null;
  let staffId: string;
  let storeId: string;
  let date: string;
  if (attendanceId) {
    const { data } = await admin.from("attendance").select(SNAPSHOT_COLUMNS).eq("id", attendanceId).maybeSingle<AttendanceSnapshot>();
    if (!data) return fail("記録が見つかりません");
    before = data;
    ({ staff_id: staffId, store_id: storeId, date } = data);
  } else {
    staffId = get("staff");
    storeId = get("store");
    date = get("date");
    if (!staffId || !storeId || !DATE.test(date)) return fail("スタッフ・店舗・勤務日を選んでください");
    if (await findAttendance(admin, staffId, date)) return fail("この日の記録はすでにあります。一覧から［修正］で直してください");
  }

  const checkin = jstDateTimeToISO(date, inTime);
  const checkout = outTime ? jstCheckoutToISO(date, outTime, checkin) : null;
  if (checkout && Date.parse(checkout) - Date.parse(checkin) > 24 * 60 * 60 * 1000) return fail("出勤から24時間を超えています。日付と時刻を確認してください");
  const after = { store_id: storeId, checkin_time: checkin, checkout_time: checkout, break_minutes: checkout ? breakMinutes : 0 };

  const saved = attendanceId
    ? await admin.from("attendance").update(after).eq("id", attendanceId).select("id").single()
    : await admin.from("attendance").insert({ ...after, staff_id: staffId, date, source: "admin" }).select("id").single();
  if (saved.error) {
    console.error("saveAttendance failed", saved.error);
    return fail("保存に失敗しました");
  }
  await recordEdit(admin, {
    attendanceId: saved.data.id,
    staffId,
    date,
    action: attendanceId ? "update" : "create",
    before: pick(before),
    after,
    reason: `本部修正：${reason}`,
    note,
    editedBy: me.id,
  });
  revalidatePath("/attendance");
  redirect(`/attendance?${new URLSearchParams({ store: storeId, month: date.slice(0, 7), staff: staffId, saved: "1" })}`);
}

export async function deleteAttendance(attendanceId: string, _prev: EditState, fd: FormData): Promise<EditState> {
  const me = await requireAdmin();
  const admin = createAdminClient();
  const reason = String(fd.get("reason") ?? "");
  if (!(EDIT_REASONS as readonly string[]).includes(reason)) return { error: "理由を選んでから削除してください", at: Date.now() };
  const { data: before } = await admin.from("attendance").select(SNAPSHOT_COLUMNS).eq("id", attendanceId).maybeSingle<AttendanceSnapshot>();
  if (!before) return { error: "記録が見つかりません", at: Date.now() };
  // 先に履歴を残してから消す（消した記録の中身が履歴に残る）
  await recordEdit(admin, {
    attendanceId: null,
    staffId: before.staff_id,
    date: before.date,
    action: "delete",
    before: pick(before),
    after: null,
    reason: `本部修正：${reason}`,
    note: String(fd.get("note") ?? "").slice(0, 200) || null,
    editedBy: me.id,
  });
  const { error } = await admin.from("attendance").delete().eq("id", attendanceId);
  if (error) return { error: "削除に失敗しました", at: Date.now() };
  revalidatePath("/attendance");
  redirect(`/attendance?${new URLSearchParams({ store: before.store_id, month: before.date.slice(0, 7), staff: before.staff_id, saved: "1" })}`);
}
