"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { isPast, monthPeriod, partTimeWeeks, periodTypeFor, weekPeriod } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequestState = { ok?: boolean; error?: string; at?: number } | undefined;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** シフト希望の提出。期間の全日について ○／◇（時間）／× を受け取り、提出の記録も残す */
export async function submitRequests(periodStart: string, _prev: RequestState, fd: FormData): Promise<RequestState> {
  const me = await requireStaff();
  const fail = (error: string) => ({ error, at: Date.now() });
  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role").eq("id", me.id).single();
  const type = periodTypeFor(self?.role);
  if (!type) return fail("シフト希望の対象外です");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return fail("期間が正しくありません");

  const period = type === "month" ? monthPeriod(periodStart.slice(0, 7)) : weekPeriod(periodStart);
  if (period.start !== periodStart) return fail("期間が正しくありません");
  if (isPast(period.submit, businessDayJST())) return fail(`提出期限（${period.submit}）を過ぎています。変更は店長に相談してください`);

  const rows = [];
  for (const date of period.days) {
    const v = String(fd.get(`a:${date}`) ?? "");
    if (v !== "all" && v !== "partial" && v !== "off") return fail(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} の希望を選んでください`);
    const start = String(fd.get(`s:${date}`) ?? "");
    const end = String(fd.get(`e:${date}`) ?? "");
    if (v === "partial" && (!TIME.test(start) || !TIME.test(end))) {
      return fail(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} の時間を「19:00」の形式で入れてください`);
    }
    rows.push({
      staff_id: me.id,
      work_date: date,
      availability: v,
      preferred_start: v === "partial" ? start : null,
      preferred_end: v === "partial" ? end : null,
      updated_at: new Date().toISOString(),
    });
  }

  const { error } = await admin.from("shift_requests").upsert(rows, { onConflict: "staff_id,work_date" });
  if (error) {
    console.error("submitRequests failed", error);
    return fail("保存できませんでした。時間をおいてもう一度お試しください");
  }
  await admin
    .from("shift_request_submissions")
    .upsert({ staff_id: me.id, period_type: type, period_start: period.start, submitted_at: new Date().toISOString() }, { onConflict: "staff_id,period_type,period_start" });
  revalidatePath("/shifts/request");
  return { ok: true, at: Date.now() };
}

/** 本人の「いつもの時間」を保存する（希望を出すときの初期値） */
export async function saveDefaultTime(_prev: RequestState, fd: FormData): Promise<RequestState> {
  const me = await requireStaff();
  const start = String(fd.get("start") ?? "");
  const end = String(fd.get("end") ?? "");
  if (!TIME.test(start) || !TIME.test(end) || start === end) return { error: "開始と終了を「19:00」の形式で入れてください", at: Date.now() };
  await createAdminClient().from("staff").update({ shift_default_start: start, shift_default_end: end }).eq("id", me.id);
  revalidatePath("/shifts/request");
  return { ok: true, at: Date.now() };
}

/**
 * アルバイトの希望：入れる日と時間だけを出す。選ばなかった日は「入れない日」として、本人が出した希望を消す
 * （急募に応募した希望は残す）。その週が始まる前日まで出し直せる
 */
export async function submitPartTimeRequests(periodStart: string, _prev: RequestState, fd: FormData): Promise<RequestState> {
  const me = await requireStaff();
  const fail = (error: string) => ({ error, at: Date.now() });
  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role").eq("id", me.id).single();
  if (periodTypeFor(self?.role) !== "week") return fail("シフト希望の対象外です");
  const period = partTimeWeeks(businessDayJST()).find((p) => p.start === periodStart);
  if (!period) return fail("この週は、もう希望を出せません（週が始まっているか、4週より先です）");

  const picked: { work_date: string; preferred_start: string; preferred_end: string }[] = [];
  for (const date of period.days) {
    if (fd.get(`on:${date}`) !== "1") continue;
    const start = String(fd.get(`s:${date}`) ?? "");
    const end = String(fd.get(`e:${date}`) ?? "");
    if (!TIME.test(start) || !TIME.test(end) || start === end) return fail(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} の時間を「19:00」の形式で入れてください`);
    picked.push({ work_date: date, preferred_start: start, preferred_end: end });
  }

  const now = new Date().toISOString();
  if (picked.length) {
    const { error } = await admin
      .from("shift_requests")
      .upsert(picked.map((p) => ({ ...p, staff_id: me.id, availability: "partial", source: "request", updated_at: now })), { onConflict: "staff_id,work_date" });
    if (error) {
      console.error("submitPartTimeRequests failed", error);
      return fail("保存できませんでした。時間をおいてもう一度お試しください");
    }
  }
  const unpicked = period.days.filter((d) => !picked.some((p) => p.work_date === d));
  if (unpicked.length) await admin.from("shift_requests").delete().eq("staff_id", me.id).eq("source", "request").in("work_date", unpicked);
  await admin
    .from("shift_request_submissions")
    .upsert({ staff_id: me.id, period_type: "week", period_start: period.start, submitted_at: now }, { onConflict: "staff_id,period_type,period_start" });
  revalidatePath("/shifts/request");
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}
