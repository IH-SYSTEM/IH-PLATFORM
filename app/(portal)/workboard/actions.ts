"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, type CurrentStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { businessDayJST } from "@/lib/business-day";
import { canUse } from "@/lib/modules";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOrg } from "@/lib/org";
import { IMPORTANCE, workboardStores } from "@/lib/workboard";

export type WbState = { ok?: string; error?: string; at?: number } | undefined;
const fail = (error: string): WbState => ({ error, at: Date.now() });

/** ワークボードを使える人か。使えなければ理由を返す */
type Scope = { all: boolean; storeIds: string[]; level: number };

async function gate(): Promise<{ me: CurrentStaff; scope: Scope } | { error: string }> {
  const me = await requireStaff();
  if (!(await canUse(me, "workboard"))) return { error: "ワークボードを使う権限がありません（権限付与で割り当てます）" };
  const scope = await workboardStores(me);
  if (scope.level < 2 || (!scope.all && !scope.storeIds.length)) return { error: "配下のスタッフがいないため、お知らせは出せません" };
  return { me, scope };
}

/**
 * 出す相手を読み、自分の範囲を超えていないかを確かめる（組織図の配下で、自分より下の段の人だけ）。
 * 全員・店あてのときも、見えるのは自分より下の段の人だけ（sender_level で絞る）
 */
async function readAudience(fd: FormData, scope: Scope, meId: string) {
  const audience = String(fd.get("audience") ?? "store");
  const sender_level = scope.level;
  if (audience === "all") {
    if (!scope.all) throw new Error("全員あては、社長・部長・経理主任だけが出せます");
    return { audience, audience_ids: [] as string[], sender_level };
  }
  if (audience === "store") {
    const ids = fd.getAll("store_ids").map(String);
    if (!ids.length) throw new Error("店舗を選んでください");
    if (!scope.all && ids.some((id) => !scope.storeIds.includes(id))) throw new Error("自分の配下の店・事業にだけ出せます");
    return { audience, audience_ids: ids, sender_level };
  }
  if (audience === "staff") {
    const ids = fd.getAll("staff_ids").map(String);
    if (!ids.length) throw new Error("スタッフを選んでください");
    const org = await loadOrg();
    if (ids.some((id) => !org.canReach(meId, id))) throw new Error("自分の配下で、自分より下の段の人にだけ出せます");
    return { audience, audience_ids: ids, sender_level };
  }
  throw new Error("出す相手を選んでください");
}

function readContent(fd: FormData) {
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const importance = String(fd.get("importance") ?? "お知らせ");
  const timing = fd.get("timing") === "check_out" ? "check_out" : "check_in";
  if (!title || title.length > 100) throw new Error("タイトルを100文字までで入れてください");
  if (!body || body.length > 2000) throw new Error("本文を2000文字までで入れてください");
  if (!(IMPORTANCE as readonly string[]).includes(importance)) throw new Error("重要度を選んでください");
  return { title, body, importance, timing };
}

/** お知らせを出す（いつから・いつまで） */
export async function createNotice(_prev: WbState, fd: FormData): Promise<WbState> {
  const g = await gate();
  if ("error" in g) return fail(g.error);
  try {
    const content = readContent(fd);
    const aud = await readAudience(fd, g.scope, g.me.id);
    const starts_on = String(fd.get("starts_on") || businessDayJST());
    const ends_on = String(fd.get("ends_on") || "") || null;
    if (ends_on && ends_on < starts_on) return fail("終わりの日が、始まりの日より前です");
    const { data, error } = await createAdminClient()
      .from("workboard_notices")
      .insert({ ...content, ...aud, starts_on, ends_on, created_by: g.me.id })
      .select("id")
      .single();
    if (error || !data) return fail("保存できませんでした");
    await audit({ actor: g.me.id, action: "create", targetType: "workboard_notice", targetId: data.id, detail: { title: content.title } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "保存できませんでした");
  }
  revalidatePath("/workboard");
  return { ok: "お知らせを出しました。対象の人は、次の打刻のときに確認します", at: Date.now() };
}

/** 出すのをやめる（確認の記録は残す） */
export async function stopNotice(id: string) {
  const g = await gate();
  if ("error" in g) throw new Error(g.error);
  const admin = createAdminClient();
  const { data: n } = await admin.from("workboard_notices").select("audience, audience_ids").eq("id", id).single();
  if (!n) return;
  if (!g.scope.all && (n.audience === "all" || (n.audience === "store" && n.audience_ids.some((s: string) => !g.scope.storeIds.includes(s))))) throw new Error("自分の店のお知らせだけ止められます");
  await admin.from("workboard_notices").update({ is_active: false }).eq("id", id);
  await audit({ actor: g.me.id, action: "update", targetType: "workboard_notice", targetId: id, detail: { stop: true } });
  revalidatePath("/workboard");
}

/** 定期配信を作る（毎月◯日・毎週◯曜・指定日の1回） */
export async function createSchedule(_prev: WbState, fd: FormData): Promise<WbState> {
  const g = await gate();
  if ("error" in g) return fail(g.error);
  try {
    const content = readContent(fd);
    const aud = await readAudience(fd, g.scope, g.me.id);
    const recurrence = String(fd.get("recurrence") ?? "");
    const row: Record<string, unknown> = { ...content, ...aud, recurrence, created_by: g.me.id };
    if (recurrence === "monthly") row.day_of_month = Number(fd.get("day_of_month"));
    else if (recurrence === "weekly") row.day_of_week = Number(fd.get("day_of_week"));
    else if (recurrence === "once") row.on_date = String(fd.get("on_date") || "") || null;
    else return fail("くり返し方を選んでください");
    const { error } = await createAdminClient().from("workboard_schedules").insert(row);
    if (error) return fail("保存できませんでした（日の選び方を確かめてください）");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "保存できませんでした");
  }
  revalidatePath("/workboard");
  return { ok: "定期配信を作りました。その日の最初の打刻のときに、お知らせが出ます", at: Date.now() };
}

async function ownSchedule(id: string) {
  const g = await gate();
  if ("error" in g) throw new Error(g.error);
  const { data: s } = await createAdminClient().from("workboard_schedules").select("audience, audience_ids").eq("id", id).single();
  if (!s) throw new Error("見つかりません");
  if (!g.scope.all && (s.audience === "all" || (s.audience === "store" && s.audience_ids.some((x: string) => !g.scope.storeIds.includes(x))))) throw new Error("自分の店のものだけ変えられます");
  return g.me;
}

export async function toggleSchedule(id: string, active: boolean) {
  await ownSchedule(id);
  await createAdminClient().from("workboard_schedules").update({ is_active: active }).eq("id", id);
  revalidatePath("/workboard");
}

export async function deleteSchedule(id: string) {
  await ownSchedule(id);
  await createAdminClient().from("workboard_schedules").delete().eq("id", id);
  revalidatePath("/workboard");
}

/** 退勤チェックリストに項目を足す（店ごと。全店共通は本部だけ） */
export async function addChecklistItem(_prev: WbState, fd: FormData): Promise<WbState> {
  const g = await gate();
  if ("error" in g) return fail(g.error);
  const label = String(fd.get("label") ?? "").trim();
  const storeId = String(fd.get("store_id") ?? "") || null;
  if (!label || label.length > 100) return fail("項目を100文字までで入れてください");
  if (!storeId && !g.scope.all) return fail("全店共通の項目は、本部だけが足せます");
  if (storeId && !g.scope.all && !g.scope.storeIds.includes(storeId)) return fail("自分の店にだけ足せます");
  const { count } = await createAdminClient().from("workboard_checklist_items").select("id", { count: "exact", head: true });
  await createAdminClient().from("workboard_checklist_items").insert({ label, store_id: storeId, sort_order: (count ?? 0) + 1 });
  revalidatePath("/workboard");
  return { ok: "足しました", at: Date.now() };
}

export async function removeChecklistItem(id: string) {
  const g = await gate();
  if ("error" in g) throw new Error(g.error);
  const admin = createAdminClient();
  const { data: item } = await admin.from("workboard_checklist_items").select("store_id").eq("id", id).single();
  if (!item) return;
  if (!g.scope.all && (!item.store_id || !g.scope.storeIds.includes(item.store_id))) throw new Error("自分の店の項目だけ外せます");
  await admin.from("workboard_checklist_items").update({ is_active: false }).eq("id", id);
  revalidatePath("/workboard");
}
