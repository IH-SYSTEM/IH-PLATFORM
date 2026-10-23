"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { isBusyDay, isPast, isStoreClosed, monthPeriod, offLimitFor, partTimeWeeks, periodTypeFor, weekPeriod } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequestState = { ok?: boolean; error?: string; at?: number } | undefined;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  const picked: { work_date: string; preferred_start: string | null; preferred_end: string | null; availability: "all" | "partial" }[] = [];
  for (const date of period.days) {
    if (fd.get(`on:${date}`) !== "1") continue;
    // 終日OK（開店〜閉店ならいつでも）。2026-10-23
    if (fd.get(`all:${date}`) === "1") {
      picked.push({ work_date: date, preferred_start: null, preferred_end: null, availability: "all" });
      continue;
    }
    const start = String(fd.get(`s:${date}`) ?? "");
    const end = String(fd.get(`e:${date}`) ?? "");
    if (!TIME.test(start) || !TIME.test(end) || start === end) return fail(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} の時間を「19:00」の形式で入れてください`);
    picked.push({ work_date: date, preferred_start: start, preferred_end: end, availability: "partial" });
  }

  const now = new Date().toISOString();
  if (picked.length) {
    const { error } = await admin
      .from("shift_requests")
      .upsert(picked.map((p) => ({ ...p, staff_id: me.id, source: "request", updated_at: now })), { onConflict: "staff_id,work_date" });
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

/**
 * 正社員の希望：休みの希望を出す（2026-10-19 黒田さん）。店休日は自動で休み、それ以外に「希望休」を上限まで選ぶ。
 * 上限より多く休むときは有給で申請する。選ばなかった日は「出勤できる」として残す
 */
export async function submitOffRequests(periodStart: string, _prev: RequestState, fd: FormData): Promise<RequestState> {
  const me = await requireStaff();
  const fail = (error: string) => ({ error, at: Date.now() });
  const admin = createAdminClient();
  const { data: self } = await admin.from("staff").select("role, store_id, busy_off_allowed").eq("id", me.id).single();
  if (periodTypeFor(self?.role) !== "month") return fail("シフト希望の対象外です");
  const period = monthPeriod(periodStart.slice(0, 7));
  if (period.start !== periodStart) return fail("期間が正しくありません");
  if (isPast(period.submit, businessDayJST())) return fail(`提出期限（${period.submit}）を過ぎています。変更はシフト管理者に相談してください`);
  const { data: store } = self?.store_id ? await admin.from("stores").select("closed_weekdays, closed_dates, requested_off_limit, monthly_holidays, busy_weekdays, busy_dates").eq("id", self.store_id).maybeSingle() : { data: null };
  const closed = (d: string) => isStoreClosed(d, store?.closed_weekdays ?? [], store?.closed_dates ?? []);
  // 希望休は2段階：fixed＝動かせない／flexible＝調整できる（予約しだいで出勤に変えてよい）。2026-10-21
  const pick = (k: string) => new Set(fd.getAll(k).map(String).filter((d) => period.days.includes(d) && !closed(d)));
  const fixed = pick("fixed");
  const flexible = pick("flexible");
  for (const d of fixed) flexible.delete(d);
  const off = new Set([...fixed, ...flexible]);
  // 繁忙日は出勤が必須。「繁忙日も希望休を出せる」人だけ出せる
  if (!self?.busy_off_allowed) {
    const busy = [...off].filter((d) => isBusyDay(d, store?.busy_weekdays ?? [], store?.busy_dates ?? []));
    if (busy.length) return fail(`${busy.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join("・")} は繁忙日のため、希望休を出せません`);
  }
  // 月の休み（ふつう6日）＝店休日＋希望休。店休日が多い月は希望休が減る
  const limit = store ? offLimitFor(period.days, store) : null;
  if (limit !== null && off.size > limit) return fail(`この月の希望休は${limit}日までです（店休日と合わせて${store?.monthly_holidays ?? ""}日）。それより多く休むときは、有給で申請してください`);
  const now = new Date().toISOString();
  const rows = period.days.map((d) => ({
    staff_id: me.id,
    work_date: d,
    availability: closed(d) || off.has(d) ? "off" : "all",
    preferred_start: null,
    preferred_end: null,
    note: closed(d) ? "店休日" : off.has(d) ? "希望休" : null,
    firmness: closed(d) ? null : fixed.has(d) ? "fixed" : flexible.has(d) ? "flexible" : null,
    updated_at: now,
  }));
  const { error } = await admin.from("shift_requests").upsert(rows, { onConflict: "staff_id,work_date" });
  if (error) {
    console.error("submitOffRequests failed", error);
    return fail("保存できませんでした。時間をおいてもう一度お試しください");
  }
  await admin.from("shift_request_submissions").upsert({ staff_id: me.id, period_type: "month", period_start: period.start, submitted_at: now }, { onConflict: "staff_id,period_type,period_start" });
  revalidatePath("/shifts/request");
  revalidatePath("/shifts");
  return { ok: true, at: Date.now() };
}
