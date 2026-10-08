"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { audit } from "@/lib/audit";
import { businessDayJST } from "@/lib/business-day";
import { pushLine } from "@/lib/line-push";
import { canCallUrgent, periodTypeFor, URGENT_REASONS } from "@/lib/shift-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type UrgentState = { ok?: string; error?: string; at?: number } | undefined;

const MAX_CALLS_PER_DAY = 2; // 同じ店・同じ日は2回まで
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${"日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;

/**
 * 急募：その店のアルバイトで、その日にシフトがない人全員に LINE で募る。
 * 使えるのは店長・管理者だけ、今日から3日後まで、同じ店・同じ日は2回まで、理由は必須
 */
export async function sendUrgentCall(storeId: string, date: string, _prev: UrgentState, fd: FormData): Promise<UrgentState> {
  const fail = (error: string) => ({ error, at: Date.now() });
  const me = await requireStaff();
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, storeId)) return fail("この店舗で急募を使う権限がありません");
  if (!canCallUrgent(date, businessDayJST())) return fail("急募は、今日から3日後までの日にだけ使えます");

  const start = String(fd.get("start") ?? "");
  const end = String(fd.get("end") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 100) || null;
  if (!TIME.test(start) || !TIME.test(end) || start === end) return fail("募集する時間を入れてください");
  if (!(URGENT_REASONS as readonly string[]).includes(reason)) return fail("理由を選んでください");
  if (reason === "その他" && !note) return fail("「その他」のときは、理由を書いてください");
  if (!process.env.LINE_MESSAGING_ACCESS_TOKEN) return fail("LINE通知の設定がまだのため、急募を送れません（本部に連絡してください）");

  const admin = createAdminClient();
  const { count } = await admin.from("urgent_calls").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("work_date", date);
  if ((count ?? 0) >= MAX_CALLS_PER_DAY) return fail(`この日の急募は、もう${MAX_CALLS_PER_DAY}回使いました`);

  // 送る相手：その店のアルバイト（在籍・LINE連携済み・公式LINEの友だち）で、その日にシフトが1つもない人
  const [{ data: staff }, { data: busy }, { data: store }] = await Promise.all([
    admin.from("staff").select("id, role, line_user_id, line_friend").eq("store_id", storeId).eq("retired", false),
    admin.from("shift_schedule").select("staff_id").eq("work_date", date),
    admin.from("stores").select("name").eq("id", storeId).single(),
  ]);
  const busyIds = new Set((busy ?? []).map((b) => b.staff_id));
  const targets = (staff ?? []).filter((s) => periodTypeFor(s.role) === "week" && s.line_user_id && s.line_friend === true && !busyIds.has(s.id));
  if (!targets.length) return fail("送れるアルバイトがいません（その日シフトのない、LINE連携済みのアルバイトがいません）");

  const { data: call, error } = await admin
    .from("urgent_calls")
    .insert({ store_id: storeId, work_date: date, start_time: start, end_time: end, reason, note, created_by: me.id })
    .select("id")
    .single();
  if (error || !call) return fail("急募を記録できませんでした");

  const h = await headers();
  const url = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/shifts/urgent/${call.id}`;
  const text = [`【急募】${store?.name ?? ""}`, `${md(date)} ${start}〜${end}`, `理由：${reason}${note ? `（${note}）` : ""}`, "", "入れる方は、こちらから応募してください", url].join("\n");
  const { sent } = await pushLine(targets.map((t) => t.line_user_id), text, "urgent");
  await admin.from("urgent_calls").update({ sent_count: sent }).eq("id", call.id);
  await audit({ actor: me.id, action: "create", targetType: "urgent_call", targetId: call.id, detail: { store: storeId, date, reason, sent } });
  revalidatePath("/shifts");
  return { ok: `${sent}名にLINEで急募を送りました`, at: Date.now() };
}

/** 急募に応募する。希望（急募から）として入り、店長がシフトを確定する */
export async function respondUrgent(callId: string, _prev: UrgentState, fd: FormData): Promise<UrgentState> {
  const fail = (error: string) => ({ error, at: Date.now() });
  const me = await requireStaff();
  const admin = createAdminClient();
  const { data: call } = await admin.from("urgent_calls").select("id, store_id, work_date, start_time, end_time").eq("id", callId).maybeSingle();
  if (!call || call.work_date < businessDayJST()) return fail("この急募は締め切られました");
  const start = String(fd.get("start") ?? "");
  const end = String(fd.get("end") ?? "");
  if (!TIME.test(start) || !TIME.test(end) || start === end) return fail("入れる時間を入れてください");

  // 応募できるのは、その店のアルバイトだけ
  const { data: self } = await admin.from("staff").select("role, store_id").eq("id", me.id).single();
  if (periodTypeFor(self?.role) !== "week" || self?.store_id !== call.store_id) return fail("この急募は、この店のアルバイトだけが応募できます");
  const { data: shift } = await admin.from("shift_schedule").select("id").eq("staff_id", me.id).eq("work_date", call.work_date).maybeSingle();
  if (shift) return fail("この日はすでにシフトが入っています");
  const { error } = await admin.from("shift_requests").upsert(
    {
      staff_id: me.id,
      work_date: call.work_date,
      availability: "partial",
      preferred_start: start,
      preferred_end: end,
      source: "urgent",
      urgent_call_id: call.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,work_date" },
  );
  if (error) return fail("応募できませんでした。時間をおいてもう一度お試しください");

  // 店長（店舗マスタの店長）に知らせる
  const { data: store } = await admin.from("stores").select("name, manager_staff_ids").eq("id", call.store_id).single();
  const managers = store?.manager_staff_ids?.length
    ? (await admin.from("staff").select("line_user_id").in("id", store.manager_staff_ids).eq("retired", false)).data ?? []
    : [];
  await pushLine(
    managers.map((m) => m.line_user_id),
    `【急募に応募】${me.name}さん\n${store?.name ?? ""} ${md(call.work_date)} ${start}〜${end}\nシフト確定の画面で確定してください`,
    "urgent",
  );
  revalidatePath("/shifts");
  return { ok: "応募しました。店長が確定すると、シフトに表示されます", at: Date.now() };
}
