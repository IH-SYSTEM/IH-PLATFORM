import "server-only";
import { pushLine } from "@/lib/line-push";
import { visibleShifts } from "@/lib/shifts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 打刻とシフトの決まり（2026-10-16 黒田さん決定）
 *   出勤：シフトがある日は、シフト開始の15分前から押せる。シフトがない日も押せるが「シフトなしの出勤」として店長に LINE（承認／却下）
 *   退勤：シフトの終わりから15分以上たっていたら、理由（選ぶ＋書く）がないと押せない。店長に LINE（承認／却下）。給与に入る残業は承認した分だけ
 */
export const EARLY_MINUTES = 15;
export const OVERTIME_MINUTES = 15;
export const OVERTIME_CATEGORIES = ["お客様対応", "片付け・締め作業", "店長の指示", "その他"] as const;

const MIN = 60_000;
const jstAt = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm.slice(0, 5)}:00+09:00`);
export const hhmmJST = (ms: number) => new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

/** その日の、本人に見えている（確定した）出勤のシフト。始まりと終わり（日をまたぐときは翌日） */
export async function shiftOn(staffId: string, date: string): Promise<{ start: number; end: number; startText: string; endText: string } | null> {
  const { data: me } = await createAdminClient().from("staff").select("role").eq("id", staffId).single();
  const rows = await visibleShifts(staffId, me?.role ?? null, date, date);
  const s = rows.find((r) => r.shift_type === "work" && r.planned_start && r.planned_end);
  if (!s) return null;
  const start = jstAt(date, s.planned_start!);
  let end = jstAt(date, s.planned_end!);
  if (end <= start) end += 86_400_000; // 19:30〜00:30 のように日をまたぐ
  return { start, end, startText: s.planned_start!.slice(0, 5), endText: s.planned_end!.slice(0, 5) };
}

/** 出勤を押せる時刻（シフト開始の15分前）。シフトがなければ null（いつでも押せる） */
export const checkInFrom = (shift: { start: number } | null) => (shift ? shift.start - EARLY_MINUTES * MIN : null);

/** 退勤で理由が要るか（シフトの終わりから15分以上）。要るなら、シフトの終わりからの分 */
export function overtimeAt(shift: { end: number } | null, now: number): number | null {
  if (!shift) return null;
  const over = Math.floor((now - shift.end) / MIN);
  return over >= OVERTIME_MINUTES ? over : null;
}

/** その店で承認する人（店長）：店舗マスタの店長・その店の立場「店長」・組織図のその店の責任者。いなければ総務の担当と代表 */
export async function approversOf(storeId: string): Promise<{ id: string; line_user_id: string | null }[]> {
  const admin = createAdminClient();
  const [{ data: store }, { data: unit }, { data: storeStaff }] = await Promise.all([
    admin.from("stores").select("manager_staff_ids").eq("id", storeId).single(),
    admin.from("org_units").select("head_staff_ids").eq("store_id", storeId).maybeSingle(),
    admin.from("staff").select("id").eq("store_id", storeId).eq("permission", "store").eq("retired", false),
  ]);
  let ids = new Set([...(store?.manager_staff_ids ?? []), ...(unit?.head_staff_ids ?? []), ...(storeStaff ?? []).map((s) => s.id)]);
  if (!ids.size) {
    const { data: soumu } = await admin.from("staff_duties").select("staff_id").eq("duty", "soumu");
    ids = new Set([...(soumu ?? []).map((s) => s.staff_id), ...(process.env.CEO_STAFF_ID ? [process.env.CEO_STAFF_ID] : [])]);
  }
  const { data } = await admin.from("staff").select("id, line_user_id").in("id", [...ids]).eq("retired", false);
  return data ?? [];
}

/** 店長に LINE で「承認しますか？」を送る（押すと承認の画面が開く） */
export async function notifyReview(opts: { attendanceId: string; kind: "noshift" | "overtime"; storeId: string; staffName: string; detail: string; origin: string }) {
  const to = await approversOf(opts.storeId);
  const url = `${opts.origin}/attendance/review/${opts.attendanceId}?k=${opts.kind}`;
  const text =
    opts.kind === "noshift"
      ? `【シフトなしの出勤】${opts.staffName}さん\n${opts.detail}\nシフトがない日の出勤です。承認しますか？\n${url}`
      : `【残業の確認】${opts.staffName}さん ${opts.detail}\n承認しますか？\n${url}`;
  await pushLine(
    to.map((p) => p.line_user_id),
    text,
    "report",
  );
}
