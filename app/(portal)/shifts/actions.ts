"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { isShiftType } from "@/lib/shifts";
import { pushLine } from "@/lib/line-push";
import { mondayOf, periodTypeFor, weekDays } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type ShiftState = { ok?: boolean; error?: string; at?: number } | undefined;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TYPE_TEXT: Record<string, string> = { work: "出勤", off: "公休", paid_leave: "有給", special: "特別休暇" };
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T12:00:00Z`).getUTCDay()]}）`;
const shiftText = (s: { shift_type: string; planned_start: string | null; planned_end: string | null } | null) =>
  !s ? "なし" : s.shift_type === "work" ? `${(s.planned_start ?? "").slice(0, 5)}〜${(s.planned_end ?? "").slice(0, 5)}` : TYPE_TEXT[s.shift_type] ?? s.shift_type;

/**
 * 社員のシフトを、確定したあとに変えたら本人に LINE で知らせる（2026-10-21）。
 * 確定＝その月を確定済み、または「社員を週ごとに確定する店」でその週を確定済み
 */
async function notifyFulltimeChange(opts: { storeId: string; staffId: string; date: string; before: string; after: string; by: string }) {
  if (opts.before === opts.after) return;
  const admin = createAdminClient();
  const [{ data: person }, { data: store }, { data: decisions }] = await Promise.all([
    admin.from("staff").select("role, line_user_id").eq("id", opts.staffId).single(),
    admin.from("stores").select("name, fulltime_weekly").eq("id", opts.storeId).single(),
    admin.from("shift_decisions").select("period_type, period_start").eq("store_id", opts.storeId).in("period_start", [`${opts.date.slice(0, 7)}-01`, mondayOf(opts.date)]),
  ]);
  if (periodTypeFor(person?.role) !== "month") return;
  const decided = (decisions ?? []).some((d) => (d.period_type === "month" && d.period_start === `${opts.date.slice(0, 7)}-01`) || (store?.fulltime_weekly && d.period_type === "week" && d.period_start === mondayOf(opts.date)));
  if (!decided) return;
  await pushLine([person?.line_user_id], `【シフトが変わりました】${store?.name ?? ""} ${md(opts.date)}\n${opts.before} → ${opts.after}\n変更：${opts.by}さん`, "other");
}

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
  const { data: prevShift } = await admin.from("shift_schedule").select("shift_type, planned_start, planned_end, store_id").eq("staff_id", staffId).eq("work_date", date).maybeSingle();
  if (fd.get("clear") === "1") {
    await admin.from("shift_schedule").delete().eq("staff_id", staffId).eq("work_date", date).eq("store_id", storeId);
    if (prevShift?.store_id === storeId) await notifyFulltimeChange({ storeId, staffId, date, before: shiftText(prevShift), after: "なし", by: me.name });
    revalidatePath("/shifts");
    return { ok: true, at: Date.now() };
  }
  if (!isShiftType(type)) return fail("種類を選んでください");
  // アルバイトは、希望（または急募への応募）が出ている日だけシフトに入れられる。
  // ただし、その店のシフト管理者は、今日以降ならいつでも、希望がなくても入れられる（2026-10-19 黒田さん）。そのときは本人に LINE で知らせる
  const [{ data: person }, { data: request }, { data: storeSm }] = await Promise.all([
    admin.from("staff").select("role, name, line_user_id").eq("id", staffId).single(),
    admin.from("shift_requests").select("availability").eq("staff_id", staffId).eq("work_date", date).maybeSingle(),
    admin.from("stores").select("name, shift_manager_staff_id").eq("id", storeId).single(),
  ]);
  const isShiftManager = storeSm?.shift_manager_staff_id === me.id;
  const noRequest = periodTypeFor(person?.role) === "week" && type === "work" && (!request || request.availability === "off");
  if (noRequest && !isShiftManager) {
    return fail("この日は希望が出ていないため、シフトに入れられません。人が足りないときは急募で募るか、シフト管理者に入れてもらってください");
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
  // 社員：確定したあとに変えたら知らせる
  await notifyFulltimeChange({
    storeId,
    staffId,
    date,
    before: shiftText(prevShift?.store_id === storeId ? prevShift : null),
    after: shiftText({ shift_type: type, planned_start: type === "work" ? start : null, planned_end: type === "work" ? end : null }),
    by: me.name,
  });
  // 希望のない日にシフト管理者が入れたときは、本人に知らせる（知らないうちにシフトが入っていた、を防ぐ）
  if (noRequest) {
    await pushLine(
      [person?.line_user_id],
      `【シフトが入りました】${storeSm?.name ?? ""} ${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${"日月火水木金土"[new Date(`${date}T12:00:00Z`).getUTCDay()]}）${start}〜${end}${workRole ? `・${workRole}` : ""}\nシフト管理者の${me.name}さんが入れました。都合が悪いときは、${me.name}さんに伝えてください`,
      "other",
    );
  }
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}

/**
 * 「この週（アルバイト）／この月（社員）を確定」。確定した期間のシフトがスタッフに見えるようになる。
 * 社員を週ごとに確定する店（根っこ）は、週を初めて確定したとき、社員に翌週の勤務を LINE で知らせる
 * （1週間単位の非定型的変形労働時間制の「前の週の終わりまでに、各日の勤務時間を知らせる」に合わせる）
 */
export async function decidePeriod(storeId: string, periodType: "week" | "month", periodStart: string): Promise<ShiftState> {
  let me;
  try {
    me = await requireShiftEditor(storeId);
  } catch (e) {
    return { error: (e as Error).message, at: Date.now() };
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from("shift_decisions").select("store_id").eq("store_id", storeId).eq("period_type", periodType).eq("period_start", periodStart).maybeSingle();
  const { error } = await admin
    .from("shift_decisions")
    .upsert({ store_id: storeId, period_type: periodType, period_start: periodStart, decided_by: me.id, decided_at: new Date().toISOString() });
  if (error) return { error: "確定できませんでした", at: Date.now() };
  if (periodType === "week" && !before) {
    const { data: store } = await admin.from("stores").select("name, fulltime_weekly").eq("id", storeId).single();
    if (store?.fulltime_weekly) {
      const days = weekDays(periodStart);
      const [{ data: people }, { data: rows }] = await Promise.all([
        admin.from("staff").select("id, role, line_user_id").eq("store_id", storeId).eq("retired", false),
        admin.from("shift_schedule").select("staff_id, work_date, shift_type, planned_start, planned_end").eq("store_id", storeId).in("work_date", days),
      ]);
      for (const p of (people ?? []).filter((x) => periodTypeFor(x.role) === "month")) {
        const lines = days.map((d) => `${md(d)} ${shiftText((rows ?? []).find((r) => r.staff_id === p.id && r.work_date === d) ?? null)}`);
        await pushLine([p.line_user_id], `【来週のシフト】${store.name} ${md(days[0])}〜${md(days[6])}\n${lines.join("\n")}`, "other");
      }
    }
  }
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}

/** アルバイトのシフト希望を却下する（その日はシフトに入れない。「待機」から外す）。undo=true で取り消す */
export async function rejectRequest(storeId: string, staffId: string, date: string, undo = false): Promise<ShiftState> {
  let me;
  try {
    me = await requireShiftEditor(storeId);
  } catch (e) {
    return { error: (e as Error).message, at: Date.now() };
  }
  if (!DATE.test(date)) return { error: "日付が正しくありません", at: Date.now() };
  if (date < businessDayJST()) return { error: "過ぎた日は変更できません", at: Date.now() };
  const { error } = await createAdminClient()
    .from("shift_requests")
    .update(undo ? { decision: null, decided_by: null, decided_at: null } : { decision: "rejected", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("staff_id", staffId)
    .eq("work_date", date);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}
