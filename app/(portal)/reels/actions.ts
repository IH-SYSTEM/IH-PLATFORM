"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff, type CurrentStaff } from "@/lib/auth";
import { canUse } from "@/lib/modules";
import { WEEKLY_LIMIT } from "@/lib/reel-plan";
import { CHUNK, madeThisWeek, MAX_SOURCE, processReel, REEL_BUCKET, resultUrls } from "@/lib/reels";
import { createAdminClient } from "@/lib/supabase/admin";

async function guard(): Promise<{ me: CurrentStaff; error?: undefined } | { me?: undefined; error: string }> {
  const me = await requireStaff();
  if (!(await canUse(me, "reel"))) return { error: "リール作成を使う権限がありません（権限付与で SNS 担当に付けます）" };
  return { me };
}

/** 作り始める：1本分の記録を作り、動画を分けて上げる先を返す */
export async function startReel(input: { seconds: number; bgmMode: string; bgmId: string | null; memo: string; name: string; size: number }) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  const seconds = Math.round(Number(input.seconds));
  if (!(seconds >= 5 && seconds <= 90)) return { error: "仕上がりの秒数は 5〜90 秒で決めてください" };
  if (!(input.size > 0)) return { error: "動画を選んでください" };
  if (input.size > MAX_SOURCE) return { error: `動画が大きすぎます（${Math.round(MAX_SOURCE / 1024 / 1024)}MB まで）。撮った動画を短く切ってから上げてください` };
  const bgmMode = ["auto", "pick", "none"].includes(input.bgmMode) ? input.bgmMode : "auto";
  const admin = createAdminClient();
  if ((await madeThisWeek(g.me.id)) >= WEEKLY_LIMIT) return { error: `今週はもう ${WEEKLY_LIMIT} 本作りました。月曜からまた作れます` };
  const { data: self } = await admin.from("staff").select("store_id").eq("id", g.me.id).single();
  const chunks = Math.ceil(input.size / CHUNK);
  const { data: reel, error } = await admin
    .from("reels")
    .insert({
      staff_id: g.me.id,
      store_id: self?.store_id ?? null,
      target_seconds: seconds,
      bgm_mode: bgmMode,
      bgm_id: bgmMode === "pick" ? input.bgmId : null,
      memo: String(input.memo ?? "").trim().slice(0, 200) || null,
      source_name: String(input.name ?? "").slice(0, 200),
      source_size: input.size,
      chunk_count: chunks,
      stage: "動画を送っています",
    })
    .select("id")
    .single();
  if (error || !reel) return { error: "始められませんでした" };
  const uploads: { path: string; token: string }[] = [];
  for (let i = 0; i < chunks; i++) {
    const { data, error: e } = await admin.storage.from(REEL_BUCKET).createSignedUploadUrl(`${reel.id}/source.${i}`, { upsert: true });
    if (e || !data) return { error: "送り先を用意できませんでした" };
    uploads.push({ path: data.path, token: data.token });
  }
  return { id: reel.id, chunk: CHUNK, uploads };
}

/** 動画を送り終えたら、裏で作り始める */
export async function runReel(id: string) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  const admin = createAdminClient();
  const { data: r } = await admin.from("reels").select("staff_id, status").eq("id", id).single();
  if (!r || r.staff_id !== g.me.id) return { error: "見つかりません" };
  if (r.status !== "uploading") return { ok: true };
  await admin.from("reels").update({ status: "processing", stage: "準備しています", updated_at: new Date().toISOString() }).eq("id", id);
  after(() => processReel(id));
  return { ok: true };
}

/** いまの状態（画面が数秒ごとに聞く）。できていれば、見る・保存するためのアドレスも */
export async function reelStatus(id: string) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  const admin = createAdminClient();
  const { data: r } = await admin.from("reels").select("staff_id, status, stage, error, result_path, updated_at, created_at").eq("id", id).single();
  if (!r || r.staff_id !== g.me.id) return { error: "見つかりません" };
  // 6分たっても進まなければ止まったとみなす（書き出しの上限は5分）
  const stalled = r.status === "processing" && Date.now() - Date.parse(r.updated_at) > 6 * 60_000;
  if (r.status !== "done" || !r.result_path) return { status: stalled ? "error" : r.status, stage: r.stage, error: stalled ? "途中で止まりました。動画を短くして、もう一度試してください" : r.error };
  return { status: "done", stage: r.stage, ...(await resultUrls(r.result_path, r.created_at)) };
}

/** 作ったリールを消す（本人だけ） */
export async function deleteReel(id: string) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  const admin = createAdminClient();
  const { data: r } = await admin.from("reels").select("staff_id, chunk_count, result_path").eq("id", id).single();
  if (!r || r.staff_id !== g.me.id) return { error: "見つかりません" };
  const paths = [...Array.from({ length: r.chunk_count }, (_, i) => `${id}/source.${i}`), ...(r.result_path ? [r.result_path] : [])];
  await admin.storage.from(REEL_BUCKET).remove(paths);
  await admin.from("reels").delete().eq("id", id);
  revalidatePath("/reels");
  return { ok: true };
}

/** 自分の編集ルールを足す・使う／使わない・消す（作るたびに AI への指示に入る） */
export async function addRule(body: string) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  const text = String(body ?? "").trim().slice(0, 200);
  if (!text) return { error: "ルールを入れてください" };
  const admin = createAdminClient();
  const { count } = await admin.from("reel_rules").select("id", { count: "exact", head: true }).eq("staff_id", g.me.id);
  if ((count ?? 0) >= 30) return { error: "ルールは30個までです" };
  await admin.from("reel_rules").insert({ staff_id: g.me.id, body: text, sort_order: (count ?? 0) + 1 });
  revalidatePath("/reels");
  return { ok: true };
}

export async function setRuleActive(id: string, active: boolean) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  await createAdminClient().from("reel_rules").update({ is_active: active }).eq("id", id).eq("staff_id", g.me.id);
  revalidatePath("/reels");
  return { ok: true };
}

export async function deleteRule(id: string) {
  const g = await guard();
  if (!g.me) return { error: g.error };
  await createAdminClient().from("reel_rules").delete().eq("id", id).eq("staff_id", g.me.id);
  revalidatePath("/reels");
  return { ok: true };
}
