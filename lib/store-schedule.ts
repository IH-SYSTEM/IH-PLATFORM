import "server-only";
import { mondayOf, periodTypeFor } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type ScheduleRow = {
  staff_id: string;
  work_date: string;
  shift_type: string;
  planned_start: string | null;
  planned_end: string | null;
  work_role: string | null;
};
export type SchedulePerson = { id: string; name: string; furigana: string | null; role: string | null; help: boolean };

/**
 * ワークボード（2026-10-23）：ある店の、確定したシフトを全員分。見せてよいものの決まりは本人のスケジュールと同じ
 *   アルバイト … 承認したシフトはすぐ見せる
 *   社員       … 店長がその月（週で確定する店は週）を「確定」したあとだけ見せる
 */
export async function storeSchedule(storeId: string, from: string, to: string) {
  const admin = createAdminClient();
  const [{ data: rows }, { data: decisions }, { data: members }] = await Promise.all([
    admin
      .from("shift_schedule")
      .select("staff_id, work_date, shift_type, planned_start, planned_end, work_role")
      .eq("store_id", storeId)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("planned_start", { nullsFirst: false })
      .returns<ScheduleRow[]>(),
    admin.from("shift_decisions").select("period_type, period_start").eq("store_id", storeId),
    admin.from("staff").select("id, name, furigana, role").eq("store_id", storeId).eq("retired", false),
  ]);
  // ヘルプ（ほかの店の人）でこの店にシフトがある人も行に出す
  const memberIds = new Set((members ?? []).map((m) => m.id));
  const helpIds = [...new Set((rows ?? []).map((r) => r.staff_id))].filter((id) => !memberIds.has(id));
  const { data: helpers } = helpIds.length ? await admin.from("staff").select("id, name, furigana, role").in("id", helpIds) : { data: [] };
  const roleOf = new Map([...(members ?? []), ...(helpers ?? [])].map((p) => [p.id, p.role]));

  const decided = new Set((decisions ?? []).map((d) => `${d.period_type}:${d.period_start}`));
  const shown = (r: ScheduleRow) => {
    const type = periodTypeFor(roleOf.get(r.staff_id)) ?? "week";
    if (type === "week") return true;
    return decided.has(`month:${r.work_date.slice(0, 7)}-01`) || decided.has(`week:${mondayOf(r.work_date)}`);
  };

  const people: SchedulePerson[] = [
    ...(members ?? []).filter((m) => periodTypeFor(m.role)).map((m) => ({ ...m, help: false })),
    ...(helpers ?? []).map((h) => ({ ...h, help: true })),
  ];
  return { shifts: (rows ?? []).filter(shown), people };
}
