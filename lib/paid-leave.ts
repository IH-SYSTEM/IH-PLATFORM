import "server-only";
import { toJSTDateString } from "@/lib/business-day";
import { pushLine } from "@/lib/line-push";
import { approversOf } from "@/lib/punch-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { paidLeaveBalance, type Balance } from "@/lib/paid-leave-calc";

export { requestDeadline, spanDays, addDays } from "@/lib/paid-leave-calc";

/** 有給の対象（2026-10-16 黒田さん決定：正社員だけ） */
export const PAID_LEAVE_ROLES = ["fulltime"];
export const isPaidLeaveRole = (role: string | null | undefined) => !!role && PAID_LEAVE_ROLES.includes(role);

export const todayJST = () => toJSTDateString(new Date());

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export const LEAVE_STATUS: Record<LeaveStatus, string> = { pending: "承認待ち", approved: "承認済み", rejected: "却下", cancelled: "取り消し" };

export type LeaveSummary = Balance & { hireDate: string | null; pendingDays: number; baseline: { asOf: string; remaining: number } | null };

/** 何人分かの有給の残り。入社日がない人は数えられない（hireDate=null、残り0） */
export async function leaveSummaries(staffIds: string[], today = todayJST()): Promise<Map<string, LeaveSummary>> {
  const out = new Map<string, LeaveSummary>();
  if (!staffIds.length) return out;
  const admin = createAdminClient();
  const [{ data: people }, { data: used }, { data: bases }, { data: pending }] = await Promise.all([
    admin.from("staff").select("id, hire_date").in("id", staffIds),
    admin.from("shift_schedule").select("staff_id, work_date").in("staff_id", staffIds).eq("shift_type", "paid_leave"),
    admin.from("paid_leave_baselines").select("staff_id, as_of, remaining").in("staff_id", staffIds),
    admin.from("paid_leave_requests").select("staff_id, days").in("staff_id", staffIds).eq("status", "pending"),
  ]);
  for (const p of people ?? []) {
    const dates = (used ?? []).filter((u) => u.staff_id === p.id).map((u) => u.work_date);
    const b = (bases ?? []).find((x) => x.staff_id === p.id);
    const baseline = b ? { asOf: b.as_of, remaining: Number(b.remaining) } : null;
    const pendingDays = (pending ?? []).filter((x) => x.staff_id === p.id).reduce((a, x) => a + x.days, 0);
    const bal: Balance = p.hire_date
      ? paidLeaveBalance({ hireDate: p.hire_date, today, used: dates, baseline })
      : baseline
        ? paidLeaveBalance({ hireDate: "9999-12-31", today, used: dates, baseline })
        : { remaining: 0, grants: [], nextGrant: null, obligation: null };
    out.set(p.id, { ...bal, hireDate: p.hire_date, pendingDays, baseline });
  }
  return out;
}

export const leaveSummary = async (staffId: string) => (await leaveSummaries([staffId])).get(staffId) ?? null;

export const mdW = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;
export const rangeText = (s: string, e: string) => (s === e ? mdW(s) : `${mdW(s)}〜${mdW(e)}`);

/** 申請が来たら店長に LINE（押すと承認の画面） */
export async function notifyLeaveRequest(opts: { requestId: string; storeId: string; staffId: string; staffName: string; start: string; end: string; days: number; late: boolean; origin: string }) {
  const to = await approversOf(opts.storeId, opts.staffId);
  await pushLine(
    to.map((p) => p.line_user_id),
    `【有給の申請】${opts.staffName}さん\n${rangeText(opts.start, opts.end)}（${opts.days}日）${opts.late ? "\n※申請の期限を過ぎています" : ""}\n承認しますか？\n${opts.origin}/leave/review/${opts.requestId}`,
    "report",
  );
}
