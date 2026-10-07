import "server-only";
import { findAttendance, pick, recordEdit } from "@/lib/attendance-write";
import { jstCheckoutToISO, jstDateTimeToISO, toJSTTimeString } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplyError, type ReportType } from "./types";

const REASONS = ["携帯忘れ", "押し忘れ", "その他"] as const;
const BREAKS = [0, 15, 30, 45, 60, 90, 120] as const;

const common = {
  subject: { key: "subject", label: "対象のスタッフ", kind: "staff", hint: "出勤・退勤した本人を選びます（自分は選べません）" },
  date: { key: "date", label: "勤務日", kind: "date", hint: "朝6時より前の退勤は、前日の日付の勤務です" },
  reason: { key: "reason", label: "理由", kind: "select", options: REASONS },
  note: { key: "note", label: "メモ", kind: "text", max: 100, optional: true },
} as const;

export const checkInReport: ReportType = {
  key: "attendance.check_in",
  version: 1,
  category: "attendance",
  title: "出勤の報告",
  description: "携帯を忘れたなど、QRで出勤できなかった人の出勤を報告します",
  fields: [common.subject, common.date, { key: "time", label: "出勤時刻", kind: "time" }, common.reason, common.note],
  subjectField: "subject",
  onSiteOnly: true,
  summary: (p, n) => `${n.subject ?? "—"}さん ${p.date} ${p.time} 出勤（${p.reason}）`,
  reportedAt: (p) => jstDateTimeToISO(String(p.date), String(p.time)),
  async apply({ reportId, storeId, reviewerId, payload: p }) {
    if (!storeId) throw new ApplyError("報告の店舗が分からないため反映できません");
    const admin = createAdminClient();
    const staffId = String(p.subject);
    const date = String(p.date);
    const existing = await findAttendance(admin, staffId, date);
    if (existing?.checkin_time) {
      throw new ApplyError(`すでに出勤の記録があります（${toJSTTimeString(existing.checkin_time)}）。違う場合は打刻修正で直してください`);
    }
    const checkin = jstDateTimeToISO(date, String(p.time));
    const row = existing
      ? await admin
          .from("attendance")
          .update({ checkin_time: checkin, source: "report", source_report_id: reportId })
          .eq("id", existing.id)
          .select("id")
          .single()
      : await admin
          .from("attendance")
          .insert({ staff_id: staffId, store_id: storeId, date, checkin_time: checkin, source: "report", source_report_id: reportId })
          .select("id")
          .single();
    if (row.error) throw new Error(row.error.message);
    await recordEdit(admin, {
      attendanceId: row.data.id,
      staffId,
      date,
      action: existing ? "update" : "create",
      before: pick(existing),
      after: { store_id: existing?.store_id ?? storeId, checkin_time: checkin },
      reason: `報告：${p.reason}`,
      note: (p.note as string) ?? null,
      reportId,
      editedBy: reviewerId,
    });
    return { attendance_id: row.data.id, checkin_time: checkin };
  },
};

export const checkOutReport: ReportType = {
  key: "attendance.check_out",
  version: 1,
  category: "attendance",
  title: "退勤の報告",
  description: "携帯を忘れたなど、QRで退勤できなかった人の退勤を報告します",
  fields: [
    common.subject,
    common.date,
    { key: "time", label: "退勤時刻", kind: "time", hint: "深夜0時を過ぎたら、そのままの時刻（例 00:30）で入力します" },
    { key: "break", label: "実際に取った休憩", kind: "minutes", options: BREAKS },
    common.reason,
    common.note,
  ],
  subjectField: "subject",
  onSiteOnly: true,
  summary: (p, n) => `${n.subject ?? "—"}さん ${p.date} ${p.time} 退勤 休憩${p.break}分（${p.reason}）`,
  reportedAt: (p) => jstDateTimeToISO(String(p.date), String(p.time)),
  async apply({ reportId, reviewerId, payload: p }) {
    const admin = createAdminClient();
    const staffId = String(p.subject);
    const date = String(p.date);
    const existing = await findAttendance(admin, staffId, date);
    if (!existing?.checkin_time) {
      throw new ApplyError("この日の出勤の記録がないため反映できません。先に出勤の報告を承認するか、打刻修正で出勤を入れてください");
    }
    if (existing.checkout_time) {
      throw new ApplyError(`すでに退勤の記録があります（${toJSTTimeString(existing.checkout_time)}）。違う場合は打刻修正で直してください`);
    }
    const checkout = jstCheckoutToISO(date, String(p.time), existing.checkin_time);
    if (Date.parse(checkout) - Date.parse(existing.checkin_time) > 24 * 60 * 60 * 1000) {
      throw new ApplyError("出勤から24時間を超えるため反映できません。日付を確認してください");
    }
    const breakMinutes = Number(p.break);
    const { error } = await admin
      .from("attendance")
      .update({ checkout_time: checkout, break_minutes: breakMinutes, source: existing.source === "qr" ? "report" : existing.source, source_report_id: reportId })
      .eq("id", existing.id)
      .is("checkout_time", null);
    if (error) throw new Error(error.message);
    await recordEdit(admin, {
      attendanceId: existing.id,
      staffId,
      date,
      action: "update",
      before: pick(existing),
      after: { checkout_time: checkout, break_minutes: breakMinutes },
      reason: `報告：${p.reason}`,
      note: (p.note as string) ?? null,
      reportId,
      editedBy: reviewerId,
    });
    return { attendance_id: existing.id, checkout_time: checkout };
  },
};
