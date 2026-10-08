"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { isShiftType } from "@/lib/shifts";
import { periodTypeFor } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type ShiftState = { ok?: boolean; error?: string; at?: number } | undefined;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// シフトを組めるのは管理者と、その店舗の店長だけ（勤怠を見られる範囲と同じ）
async function requireShiftEditor(storeId: string) {
  const me = await requireStaff();
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, storeId)) throw new Error("この店舗のシフトを編集する権限がありません");
  return me;
}

/** 1マス分（1人・1日）の確定シフトを保存する。［消す］ならその日のシフトを消す */
export async function saveShift(storeId: string, staffId: string, date: string, _prev: ShiftState, fd: FormData): Promise<ShiftState> {
  const fail = (error: string) => ({ error, at: Date.now() });
  let me;
  try {
    me = await requireShiftEditor(storeId);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!DATE.test(date)) return fail("日付が正しくありません");
  if (date < businessDayJST()) return fail("過ぎた日のシフトは変更できません。勤怠の修正は本部に報告してください");
  const admin = createAdminClient();

  const type = String(fd.get("type") ?? "");
  if (fd.get("clear") === "1") {
    await admin.from("shift_schedule").delete().eq("staff_id", staffId).eq("work_date", date).eq("store_id", storeId);
    revalidatePath("/shifts");
    return { ok: true, at: Date.now() };
  }
  if (!isShiftType(type)) return fail("種類を選んでください");
  // アルバイトは、希望（または急募への応募）が出ている日だけシフトに入れられる
  const [{ data: person }, { data: request }] = await Promise.all([
    admin.from("staff").select("role").eq("id", staffId).single(),
    admin.from("shift_requests").select("availability").eq("staff_id", staffId).eq("work_date", date).maybeSingle(),
  ]);
  if (periodTypeFor(person?.role) === "week" && type === "work" && (!request || request.availability === "off")) {
    return fail("この日は希望が出ていないため、シフトに入れられません。人が足りないときは急募で募ってください");
  }
  const start = String(fd.get("start") ?? "");
  const end = String(fd.get("end") ?? "");
  if (type === "work" && (!TIME.test(start) || !TIME.test(end))) return fail("開始・終了の時刻を入れてください");
  // 役割：店に役割の一覧があれば、出勤のときは必ずその中から選ぶ
  const { data: storeRow } = await admin.from("stores").select("work_roles").eq("id", storeId).single();
  const roles: string[] = storeRow?.work_roles ?? [];
  const workRole = String(fd.get("role") ?? "").trim() || null;
  if (type === "work" && roles.length && (!workRole || !roles.includes(workRole))) return fail("役割を選んでください");
  if (type === "work" && start === end) return fail("開始と終了が同じ時刻です");

  // 同じ日に他の店舗でシフトがある人は上書きしない（掛け持ちの取り違えを防ぐ）
  const { data: other } = await admin.from("shift_schedule").select("store_id").eq("staff_id", staffId).eq("work_date", date).maybeSingle();
  if (other && other.store_id !== storeId) return fail("この日はほかの店舗でシフトが入っています");

  const { error } = await admin.from("shift_schedule").upsert(
    {
      staff_id: staffId,
      store_id: storeId,
      work_date: date,
      shift_type: type,
      planned_start: type === "work" ? start : null,
      planned_end: type === "work" ? end : null,
      work_role: type === "work" ? workRole : null,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,work_date" },
  );
  if (error) {
    console.error("saveShift failed", error);
    return fail("保存できませんでした");
  }
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}

/** 「この週（アルバイト）／この月（社員）を確定」。確定した期間のシフトがスタッフに見えるようになる */
export async function decidePeriod(storeId: string, periodType: "week" | "month", periodStart: string): Promise<ShiftState> {
  let me;
  try {
    me = await requireShiftEditor(storeId);
  } catch (e) {
    return { error: (e as Error).message, at: Date.now() };
  }
  const { error } = await createAdminClient()
    .from("shift_decisions")
    .upsert({ store_id: storeId, period_type: periodType, period_start: periodStart, decided_by: me.id, decided_at: new Date().toISOString() });
  if (error) return { error: "確定できませんでした", at: Date.now() };
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}
