import "server-only";
import { cache } from "react";
import type { CurrentStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { monthRange, workedMinutes } from "@/lib/business-day";

/**
 * 勤怠を見られる範囲。管理者は全店舗、店長は担当店舗だけ、それ以外は見られない（null）。
 * 店長＝店舗マスタで「店長」に選ばれている人、または権限が「店長」の人の所属店舗。
 * attendance の RLS は管理者と本人しか読めないため、ここで範囲を確かめてから service role で読む
 */
export type AttendanceScope = { all: boolean; storeIds: string[] };

export const attendanceScope = cache(async function attendanceScope(me: CurrentStaff): Promise<AttendanceScope | null> {
  if (me.isAdmin) return { all: true, storeIds: [] };
  const admin = createAdminClient();
  const [{ data: managed }, { data: self }] = await Promise.all([
    admin.from("stores").select("id").contains("manager_staff_ids", [me.id]),
    admin.from("staff").select("store_id").eq("id", me.id).single(),
  ]);
  const ids = new Set((managed ?? []).map((s) => s.id));
  if (me.permission === "store" && self?.store_id) ids.add(self.store_id);
  return ids.size ? { all: false, storeIds: [...ids] } : null;
});

export const inScope = (scope: AttendanceScope, storeId: string | null) => scope.all || (!!storeId && scope.storeIds.includes(storeId));

export type AttendanceRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  store_id: string;
  store_name: string;
  date: string;
  checkin_time: string | null;
  checkout_time: string | null;
  break_minutes: number;
  source: string;  // qr … QRで打刻 / report … 報告窓口から / admin … 本部が入力 / demo … 見た目確認用の偽データ
  worked: number | null;
  lastEdit: { by: string; at: string; reason: string } | null; // 最後に記録を変えた人（打刻修正・報告の承認）
};

/** 期間の勤怠。storeIds が空なら全店舗（管理者のみ呼ぶこと）。テーブルの結合は JS 側で行う */
export async function loadAttendance(opts: { month: string; storeIds: string[]; staffId?: string }): Promise<AttendanceRow[]> {
  const admin = createAdminClient();
  const { start, end } = monthRange(opts.month);
  let q = admin
    .from("attendance")
    .select("id, staff_id, store_id, date, checkin_time, checkout_time, break_minutes, source")
    .gte("date", start)
    .lte("date", end)
    .order("date")
    .order("checkin_time")
    .limit(5000);
  if (opts.storeIds.length) q = q.in("store_id", opts.storeIds);
  if (opts.staffId) q = q.eq("staff_id", opts.staffId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const [{ data: staff }, { data: stores }, { data: edits }] = await Promise.all([
    admin.from("staff").select("id, name").in("id", [...new Set(rows.map((r) => r.staff_id))]),
    admin.from("stores").select("id, name").in("id", [...new Set(rows.map((r) => r.store_id))]),
    admin.from("attendance_edits").select("attendance_id, edited_by, edited_at, reason").in("attendance_id", rows.map((r) => r.id)).order("edited_at", { ascending: false }),
  ]);
  const editorIds = [...new Set((edits ?? []).map((e) => e.edited_by))];
  const { data: editors } = editorIds.length ? await admin.from("staff").select("id, name").in("id", editorIds) : { data: [] };
  const editorName = new Map((editors ?? []).map((s) => [s.id, s.name]));
  const lastEdit = new Map<string, { by: string; at: string; reason: string }>();
  for (const e of edits ?? []) {
    if (e.attendance_id && !lastEdit.has(e.attendance_id)) lastEdit.set(e.attendance_id, { by: editorName.get(e.edited_by) ?? "（不明）", at: e.edited_at, reason: e.reason });
  }
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    ...r,
    staff_name: staffName.get(r.staff_id) ?? "（不明）",
    store_name: storeName.get(r.store_id) ?? "（不明）",
    worked: workedMinutes(r.checkin_time, r.checkout_time, r.break_minutes),
    lastEdit: lastEdit.get(r.id) ?? null,
  }));
}

export function summarize(rows: AttendanceRow[]) {
  return {
    days: new Set(rows.filter((r) => r.checkin_time).map((r) => `${r.staff_id}:${r.date}`)).size,
    worked: rows.reduce((sum, r) => sum + (r.worked ?? 0), 0),
    breaks: rows.reduce((sum, r) => sum + (r.checkout_time ? r.break_minutes : 0), 0),
    open: rows.filter((r) => r.checkin_time && !r.checkout_time).length,
    manual: rows.filter((r) => r.source !== "qr").length,
  };
}
