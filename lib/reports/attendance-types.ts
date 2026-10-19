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
  hidden: true, // 2026-10-19 から「打刻の修正依頼」に一本化
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
  hidden: true, // 2026-10-19 から「打刻の修正依頼」に一本化
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

/**
 * 打刻の修正依頼（2026-10-19 黒田さん）。本人も、ほかの人の分も、報告窓口から依頼できる。
 * その店のシフト管理者が LINE の画面で承認すると勤怠に反映され、一覧に「修正」の印が付く。
 * 入れた時刻だけ直す（空の欄は今の記録のまま）。記録がない日は、出勤の時刻があれば新しく作る
 */
const FIX_REASONS = ["打刻を押し忘れた", "携帯を忘れた", "時刻が違う", "その他"] as const;
const FIX_BREAKS = ["変えない", ...BREAKS.map((b) => `${b}分`)] as const;
const fixFields = [
  common.date,
  { key: "checkin", label: "正しい出勤時刻", kind: "time", optional: true, hint: "直さないときは空のまま" },
  { key: "checkout", label: "正しい退勤時刻", kind: "time", optional: true, hint: "深夜0時を過ぎたら、そのままの時刻（例 00:30）。直さないときは空のまま" },
  { key: "break", label: "休憩", kind: "select", options: FIX_BREAKS },
  { key: "reason", label: "理由", kind: "select", options: FIX_REASONS },
  { key: "note", label: "メモ", kind: "text", max: 100, optional: true },
] as const;
const fixSummary = (p: Record<string, string | number>, who: string) =>
  `${who} ${p.date} ${[p.checkin ? `出勤 ${p.checkin}` : "", p.checkout ? `退勤 ${p.checkout}` : "", p.break && p.break !== "変えない" ? `休憩 ${p.break}` : ""].filter(Boolean).join("・") || "（変更なし）"}（${p.reason}）`;

async function applyFix({ reportId, storeId, reporterId, reviewerId, payload: p }: Parameters<ReportType["apply"]>[0]) {
  const admin = createAdminClient();
  const staffId = String(p.subject ?? reporterId);
  const date = String(p.date);
  const inT = p.checkin ? String(p.checkin) : null;
  const outT = p.checkout ? String(p.checkout) : null;
  const brk = typeof p.break === "string" && p.break !== "変えない" ? Number(p.break.replace("分", "")) : null;
  if (!inT && !outT && brk === null) throw new ApplyError("直す時刻が入っていません");
  const existing = await findAttendance(admin, staffId, date);
  if (!existing && !inT) throw new ApplyError("この日の勤怠の記録がありません。出勤の時刻も入れて依頼し直してもらってください");
  const checkin = inT ? jstDateTimeToISO(date, inT) : existing!.checkin_time;
  if (!checkin) throw new ApplyError("出勤の時刻が分かりません");
  const checkout = outT ? jstCheckoutToISO(date, outT, checkin) : (existing?.checkout_time ?? null);
  if (checkout && Date.parse(checkout) - Date.parse(checkin) > 24 * 60 * 60 * 1000) throw new ApplyError("出勤から24時間を超えるため反映できません。日付を確かめてください");
  if (checkout && Date.parse(checkout) <= Date.parse(checkin)) throw new ApplyError("退勤が出勤より前になっています");
  const breakMinutes = brk ?? existing?.break_minutes ?? 0;
  const after = { store_id: existing?.store_id ?? storeId, checkin_time: checkin, checkout_time: checkout, break_minutes: checkout ? breakMinutes : 0 };
  if (!after.store_id) throw new ApplyError("報告の店舗が分からないため反映できません");
  const row = existing
    ? await admin.from("attendance").update({ ...after, source_report_id: reportId }).eq("id", existing.id).select("id").single()
    : await admin.from("attendance").insert({ ...after, staff_id: staffId, date, source: "report", source_report_id: reportId }).select("id").single();
  if (row.error) throw new Error(row.error.message);
  await recordEdit(admin, {
    attendanceId: row.data.id,
    staffId,
    date,
    action: existing ? "update" : "create",
    before: pick(existing),
    after,
    reason: `修正依頼：${p.reason}`,
    note: (p.note as string) ?? null,
    reportId,
    editedBy: reviewerId,
  });
  return { attendance_id: row.data.id, checkin_time: checkin, checkout_time: checkout };
}

export const fixSelfReport: ReportType = {
  key: "attendance.fix_self",
  version: 1,
  category: "attendance",
  title: "自分の打刻の修正依頼",
  description: "押し忘れ・時刻の間違いなど、自分の出勤・退勤を直してもらいます（シフト管理者が承認）",
  fields: fixFields,
  selfSubject: true,
  shiftManagerReview: true,
  onSiteOnly: false,
  summary: (p, n) => fixSummary(p, `${n.subject ?? "本人"}さん`),
  apply: applyFix,
};

export const fixOtherReport: ReportType = {
  key: "attendance.fix_other",
  version: 1,
  category: "attendance",
  title: "ほかの人の打刻の修正依頼",
  description: "携帯を忘れた同僚など、自分以外の人の出勤・退勤を直してもらいます（シフト管理者が承認）",
  fields: [{ ...common.subject, hint: "直してほしい人を選びます" }, ...fixFields],
  subjectField: "subject",
  shiftManagerReview: true,
  onSiteOnly: false,
  summary: (p, n) => fixSummary(p, `${n.subject ?? "—"}さん`),
  apply: applyFix,
};
