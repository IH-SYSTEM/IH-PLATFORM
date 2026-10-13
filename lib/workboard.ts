import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ワークボード（打刻のときに必ず確かめてもらうお知らせ。COOKIE for MEN の CRM から移植・2026-10-13）。
 * 出勤前のお知らせを全部「確認しました」にしないと出勤できない。退勤前のお知らせと退勤チェックリストを済ませないと退勤できない。
 * 定期配信（毎月◯日・毎週◯曜・指定日）は、その日の最初の打刻のときにお知らせを作る（毎朝の自動処理を増やさない）
 */
export const IMPORTANCE = ["重要", "確認", "指示", "お知らせ", "その他"] as const;
export const IMPORTANCE_MARK: Record<string, string> = { 重要: "🔴", 確認: "🟠", 指示: "🟡", お知らせ: "🟢", その他: "⚪" };
export type Timing = "check_in" | "check_out";
export const TIMING_LABEL: Record<Timing, string> = { check_in: "出勤前", check_out: "退勤前" };

export type Notice = {
  id: string;
  title: string;
  body: string;
  importance: string;
  timing: Timing;
  audience: "all" | "store" | "staff";
  audience_ids: string[];
  starts_on: string;
  ends_on: string | null;
  schedule_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

/** 定期配信のうち、今日が当たる日のものから、今日のお知らせを作る（同じ日に2つは作らない）。定期配信のお知らせはその日だけ出す */
export async function ensureScheduledNotices(today: string) {
  const admin = createAdminClient();
  const { data: schedules } = await admin.from("workboard_schedules").select("*").eq("is_active", true);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const dom = Number(today.slice(8, 10));
  const due = (schedules ?? []).filter(
    (s) =>
      (s.recurrence === "weekly" && s.day_of_week === dow) ||
      (s.recurrence === "monthly" && Math.min(s.day_of_month, lastDay(today)) === dom) ||
      (s.recurrence === "once" && s.on_date === today),
  );
  if (!due.length) return;
  await admin.from("workboard_notices").upsert(
    due.map((s) => ({
      title: s.title,
      body: s.body,
      importance: s.importance,
      timing: s.timing,
      audience: s.audience,
      audience_ids: s.audience_ids,
      starts_on: today,
      ends_on: today,
      schedule_id: s.id,
      created_by: s.created_by,
    })),
    { onConflict: "schedule_id,starts_on", ignoreDuplicates: true },
  );
}

/** その人がまだ確認していないお知らせ（打刻した店か、所属の店あて・本人あて・全員あて） */
export async function pendingNotices(opts: { staffId: string; storeId: string | null; timing: Timing; today: string }): Promise<Notice[]> {
  const admin = createAdminClient();
  await ensureScheduledNotices(opts.today);
  const [{ data: me }, { data: notices }, { data: reads }] = await Promise.all([
    admin.from("staff").select("store_id").eq("id", opts.staffId).single(),
    admin
      .from("workboard_notices")
      .select("*")
      .eq("is_active", true)
      .eq("timing", opts.timing)
      .lte("starts_on", opts.today)
      .or(`ends_on.is.null,ends_on.gte.${opts.today}`)
      .order("created_at")
      .returns<Notice[]>(),
    admin.from("workboard_reads").select("notice_id").eq("staff_id", opts.staffId),
  ]);
  const done = new Set((reads ?? []).map((r) => r.notice_id));
  const stores = [opts.storeId, me?.store_id].filter(Boolean) as string[];
  return (notices ?? []).filter(
    (n) =>
      !done.has(n.id) &&
      (n.audience === "all" || (n.audience === "store" && n.audience_ids.some((id) => stores.includes(id))) || (n.audience === "staff" && n.audience_ids.includes(opts.staffId))),
  );
}

export async function confirmNotice(staffId: string, noticeId: string) {
  const { error } = await createAdminClient().from("workboard_reads").upsert({ notice_id: noticeId, staff_id: staffId }, { onConflict: "notice_id,staff_id", ignoreDuplicates: true });
  return !error;
}

/** 退勤チェックリスト（その店のもの＋全店共通） */
export async function checklistFor(storeId: string | null): Promise<{ id: string; label: string }[]> {
  const q = createAdminClient().from("workboard_checklist_items").select("id, label, store_id, sort_order").eq("is_active", true).order("sort_order").order("created_at");
  const { data } = await (storeId ? q.or(`store_id.is.null,store_id.eq.${storeId}`) : q.is("store_id", null));
  return (data ?? []).map((i) => ({ id: i.id, label: i.label }));
}

/** ワークボードを管理できる店の範囲（管理者は全店、店長は自分の店、それ以外は所属の店） */
export async function workboardStores(me: CurrentStaff): Promise<{ all: boolean; storeIds: string[] }> {
  const scope = await attendanceScope(me);
  if (scope) return scope;
  const { data } = await createAdminClient().from("staff").select("store_id").eq("id", me.id).single();
  return { all: false, storeIds: data?.store_id ? [data.store_id] : [] };
}

/** お知らせを見せる相手（在籍のスタッフ）。確認状況の「まだの人」を出すのに使う */
export function targetsOf<T extends { id: string; store_id: string | null }>(n: Pick<Notice, "audience" | "audience_ids">, staff: T[]): T[] {
  if (n.audience === "all") return staff;
  if (n.audience === "store") return staff.filter((s) => s.store_id && n.audience_ids.includes(s.store_id));
  return staff.filter((s) => n.audience_ids.includes(s.id));
}
