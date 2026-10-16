"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isPaidLeaveRole, leaveSummary, notifyLeaveRequest, requestDeadline, spanDays, todayJST } from "@/lib/paid-leave";
import { createAdminClient } from "@/lib/supabase/admin";

export type LeaveState = { ok?: string; error?: string; at?: number } | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (error: string): LeaveState => ({ error, at: Date.now() });

/** 期間の中で、シフトですでに「公休」の日（有給の日数に数えない） */
async function offDays(staffId: string, start: string, end: string) {
  const { data } = await createAdminClient().from("shift_schedule").select("work_date").eq("staff_id", staffId).eq("shift_type", "off").gte("work_date", start).lte("work_date", end);
  return new Set((data ?? []).map((r) => r.work_date));
}

/** 有給の申請（正社員だけ）。期限を過ぎていても出せるが「期限後」として店長に出る */
export async function requestLeave(_prev: LeaveState, form: FormData): Promise<LeaveState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role, store_id").eq("id", me.id).single();
  if (!isPaidLeaveRole(self?.role)) return fail("有給の申請は正社員の方だけです");
  if (!self?.store_id) return fail("所属の店舗が決まっていません。本部に伝えてください");
  const start = String(form.get("start_date") ?? "");
  const end = String(form.get("end_date") ?? "") || start;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!DATE.test(start) || !DATE.test(end)) return fail("日付を選んでください");
  if (end < start) return fail("終わりの日は、はじめの日より後にしてください");
  const today = todayJST();
  if (start <= today) return fail("今日より後の日を選んでください（当日・過去の分は店長に相談してください）");
  const span = spanDays(start, end);
  if (span > 60) return fail("一度に申請できるのは60日までです");

  const off = await offDays(me.id, start, end);
  const days = span - off.size;
  if (days < 1) return fail("選んだ日はすべて公休です");

  const { data: overlap } = await admin
    .from("paid_leave_requests")
    .select("id")
    .eq("staff_id", me.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", end)
    .gte("end_date", start)
    .limit(1);
  if (overlap?.length) return fail("同じ日の申請がすでにあります");

  const sum = await leaveSummary(me.id);
  if (sum && days > sum.remaining - sum.pendingDays) return fail(`残りの有給（${sum.remaining - sum.pendingDays}日）を超えています`);

  // 期限：連続する日数（公休をはさんでも、はじめから終わりまでの日数）で決める
  const late = today > requestDeadline(start, span);
  const { data: row, error } = await admin
    .from("paid_leave_requests")
    .insert({ staff_id: me.id, store_id: self.store_id, start_date: start, end_date: end, days, reason: reason || null, late })
    .select("id")
    .single();
  if (error || !row) return fail("申請できませんでした");
  await audit({ actor: me.id, action: "create", targetType: "paid_leave_request", targetId: row.id, detail: { start, end, days, late } });
  const h = await headers();
  await notifyLeaveRequest({ requestId: row.id, storeId: self.store_id, staffName: me.name, start, end, days, late, origin: `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}` });
  revalidatePath("/me/leave");
  revalidatePath("/");
  return { ok: late ? "申請しました（期限を過ぎているため、店長の判断になります）" : "申請しました。店長が確認すると LINE でお知らせします", at: Date.now() };
}

/** 承認前の申請を取り消す（本人） */
export async function cancelLeave(id: string): Promise<LeaveState> {
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data, error } = await admin.from("paid_leave_requests").update({ status: "cancelled" }).eq("id", id).eq("staff_id", me.id).eq("status", "pending").select("id");
  if (error || !data?.length) return fail("取り消せませんでした（承認済みの分は店長に相談してください）");
  await audit({ actor: me.id, action: "update", targetType: "paid_leave_request", targetId: id, detail: { status: "cancelled" } });
  revalidatePath("/me/leave");
  return { ok: "取り消しました", at: Date.now() };
}
