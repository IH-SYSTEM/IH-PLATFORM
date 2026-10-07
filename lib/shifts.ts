import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mondayOf, periodTypeFor } from "@/lib/shift-period";

export const SHIFT_TYPES = [
  { key: "work", label: "出勤", short: "出" },
  { key: "off", label: "公休", short: "休" },
  { key: "paid_leave", label: "有給", short: "有" },
  { key: "special", label: "特別休暇", short: "特" },
] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number]["key"];
export const isShiftType = (v: unknown): v is ShiftType => SHIFT_TYPES.some((t) => t.key === v);

export const AVAILABILITY = [
  { key: "all", label: "終日OK", mark: "○" },
  { key: "partial", label: "時間指定", mark: "◇" },
  { key: "off", label: "休み希望", mark: "×" },
] as const;

/** DB の time（'19:30:00'）を 'HH:MM' に */
export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/**
 * 確定シフトのうち、スタッフ本人に見せてよいもの。
 * 店長が「確定」した期間（アルバイトは週、社員は月）のシフトだけを見せる（組んでいる途中のものは見せない）
 */
export async function visibleShifts(staffId: string, role: string | null, from: string, to: string) {
  const type = periodTypeFor(role) ?? "week";
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("shift_schedule")
    .select("store_id, work_date, shift_type, planned_start, planned_end, note")
    .eq("staff_id", staffId)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date");
  if (!rows?.length) return [];
  const { data: decisions } = await admin
    .from("shift_decisions")
    .select("store_id, period_start")
    .eq("period_type", type)
    .in("store_id", [...new Set(rows.map((r) => r.store_id))]);
  const decided = new Set((decisions ?? []).map((d) => `${d.store_id}:${d.period_start}`));
  const periodOf = (date: string) => (type === "month" ? `${date.slice(0, 7)}-01` : mondayOf(date));
  return rows.filter((r) => decided.has(`${r.store_id}:${periodOf(r.work_date)}`));
}
