"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type EventState = { ok?: string; error?: string; at?: number } | undefined;

/** 入力を読む（日付・時刻・タイトル・メモ）。時刻は両方空なら終日 */
function read(fd: FormData) {
  const event_date = String(fd.get("event_date") ?? "");
  const start = String(fd.get("start_time") ?? "") || null;
  const end = String(fd.get("end_time") ?? "") || null;
  const title = String(fd.get("title") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) throw new Error("日付を選んでください");
  if (!title || title.length > 60) throw new Error("予定の名前を60文字までで入れてください");
  if (note && note.length > 500) throw new Error("メモは500文字までです");
  if ((start && !/^\d{2}:\d{2}$/.test(start)) || (end && !/^\d{2}:\d{2}$/.test(end))) throw new Error("時刻が正しくありません");
  return { event_date, start_time: start, end_time: end, title, note };
}

/** 自分の予定を入れる */
export async function addEvent(_prev: EventState, fd: FormData): Promise<EventState> {
  const me = await requireStaff();
  try {
    const { error } = await createAdminClient().from("personal_events").insert({ staff_id: me.id, ...read(fd) });
    if (error) return { error: "保存できませんでした", at: Date.now() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存できませんでした", at: Date.now() };
  }
  revalidatePath("/shifts/mine");
  return { ok: "予定を入れました", at: Date.now() };
}

/** 自分の予定を直す（本人のものだけ） */
export async function updateEvent(id: string, _prev: EventState, fd: FormData): Promise<EventState> {
  const me = await requireStaff();
  try {
    const { error } = await createAdminClient().from("personal_events").update({ ...read(fd), updated_at: new Date().toISOString() }).eq("id", id).eq("staff_id", me.id);
    if (error) return { error: "保存できませんでした", at: Date.now() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存できませんでした", at: Date.now() };
  }
  revalidatePath("/shifts/mine");
  return { ok: "直しました", at: Date.now() };
}

/** 自分の予定を消す（本人のものだけ） */
export async function deleteEvent(id: string) {
  const me = await requireStaff();
  await createAdminClient().from("personal_events").delete().eq("id", id).eq("staff_id", me.id);
  revalidatePath("/shifts/mine");
}
