import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type AttendanceSnapshot = {
  id: string;
  staff_id: string;
  store_id: string;
  date: string;
  checkin_time: string | null;
  checkout_time: string | null;
  break_minutes: number;
  source: string;
};

export const SNAPSHOT_COLUMNS = "id, staff_id, store_id, date, checkin_time, checkout_time, break_minutes, source";

export const pick = (a: AttendanceSnapshot | null) =>
  a ? { store_id: a.store_id, checkin_time: a.checkin_time, checkout_time: a.checkout_time, break_minutes: a.break_minutes } : null;

/** 勤怠の変更履歴を1件残す。給与の元データなので、どの経路の変更も必ずここを通す */
export async function recordEdit(
  admin: Admin,
  e: {
    attendanceId: string | null;
    staffId: string;
    date: string;
    action: "create" | "update" | "delete";
    before: unknown;
    after: unknown;
    reason: string;
    note?: string | null;
    reportId?: string | null;
    editedBy: string;
  },
) {
  const { error } = await admin.from("attendance_edits").insert({
    attendance_id: e.attendanceId,
    staff_id: e.staffId,
    date: e.date,
    action: e.action,
    before: e.before,
    after: e.after,
    reason: e.reason,
    note: e.note ?? null,
    report_id: e.reportId ?? null,
    edited_by: e.editedBy,
  });
  if (error) throw new Error(`attendance_edits: ${error.message}`);
}

export async function findAttendance(admin: Admin, staffId: string, date: string) {
  const { data } = await admin.from("attendance").select(SNAPSHOT_COLUMNS).eq("staff_id", staffId).eq("date", date).maybeSingle<AttendanceSnapshot>();
  return data;
}
