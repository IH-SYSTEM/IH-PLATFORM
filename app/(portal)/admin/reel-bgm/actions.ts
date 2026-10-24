"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { MOODS, REEL_BUCKET } from "@/lib/reels";
import { createAdminClient } from "@/lib/supabase/admin";

/** 曲を上げる先を用意する（mp3・m4a） */
export async function startBgmUpload(name: string) {
  await requireAdmin();
  const ext = /\.m4a$/i.test(name) ? "m4a" : "mp3";
  const path = `bgm/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(REEL_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "送り先を用意できませんでした" };
  return { path: data.path, token: data.token, contentType: ext === "m4a" ? "audio/mp4" : "audio/mpeg" };
}

export async function addBgm(input: { path: string; name: string; mood: string; credit: string }) {
  await requireAdmin();
  if (!/^bgm\/[0-9a-f-]{36}\.(mp3|m4a)$/.test(input.path)) return { error: "曲のファイルが正しくありません" };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "曲の名前を入れてください" };
  const mood = (MOODS as readonly string[]).includes(input.mood) ? input.mood : MOODS[0];
  const { error } = await createAdminClient().from("reel_bgm").insert({ path: input.path, name, mood, credit: input.credit.trim().slice(0, 200) || null });
  if (error) return { error: "登録できませんでした" };
  revalidatePath("/admin/reel-bgm");
  return { ok: true };
}

export async function setBgmActive(id: string, active: boolean) {
  await requireAdmin();
  await createAdminClient().from("reel_bgm").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/reel-bgm");
}

export async function setBgmMood(id: string, mood: string) {
  await requireAdmin();
  if (!(MOODS as readonly string[]).includes(mood)) return;
  await createAdminClient().from("reel_bgm").update({ mood }).eq("id", id);
  revalidatePath("/admin/reel-bgm");
}
