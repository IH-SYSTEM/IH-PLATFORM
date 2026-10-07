"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { isPast, monthPeriod, periodTypeFor, weekPeriod } from "@/lib/shift-period";
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
