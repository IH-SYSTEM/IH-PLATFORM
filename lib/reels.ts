import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { buildFilter, buildTelops, EMOTIONS, parseProbe, selectUnits, weekStartJST, type Speech, type Unit } from "@/lib/reel-plan";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * リール作成（2026-10-25 黒田さん）：SNS担当が動画を上げ、仕上がりの秒数を決めて「スタート」を押すと、
 * 見どころのカット・テロップ・BGM を付けた縦長の動画（1080×1920）を作る。
 *   1. 分けて上げた動画をつなぐ（Supabase の1ファイルの上限 50MB を超えるため）
 *   2. 話した言葉を文字起こし（OPENAI_API_KEY があるときだけ）
 *   3. AI（Claude）が映像のコマと文字起こしを見て、見どころの場面とキャッチコピー、BGM の雰囲気を決める
 *   4. ffmpeg で切り出し・縦長・テロップ・BGM を付けて書き出す
 */
export const REEL_BUCKET = "reels";
export const CHUNK = 45 * 1024 * 1024;
export const MAX_SOURCE = 300 * 1024 * 1024;
export const SECONDS = [15, 30, 45, 60, 90] as const;
export const MOODS = ["明るい", "落ち着いた", "おしゃれ", "元気"] as const;

const FONT_DIR = path.join(process.cwd(), "assets/fonts");
const client = new Anthropic();

function ffmpeg(args: string[], allowFail = false): Promise<string> {
  return new Promise((ok, ng) => {
    const p = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on("error", ng);
    p.on("close", (code) => (code === 0 || allowFail ? ok(err) : ng(new Error(`ffmpeg ${code}: ${err.slice(-600)}`))));
  });
}

async function stage(id: string, status: string, stage: string, extra: Record<string, unknown> = {}) {
  await createAdminClient().from("reels").update({ status, stage, updated_at: new Date().toISOString(), ...extra }).eq("id", id);
}

/** 話した言葉の文字起こし（OpenAI の Whisper。キーがなければ空） */
async function transcribe(audioFile: string): Promise<Speech[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(await readFile(audioFile))], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`文字起こしに失敗しました（${res.status}）`);
  const j = (await res.json()) as { segments?: { start: number; end: number; text: string; no_speech_prob?: number }[] };
  return (j.segments ?? []).filter((s) => (s.no_speech_prob ?? 0) < 0.6 && s.text.trim()).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
}

type Plan = { units: Unit[]; mood: string; title: string };

/**
 * AI が動画を「それだけで意味が通るまとまり」に切り分け、大事な順に順位を付ける（2026-10-26 黒田さん）。
 * どれを残すかは AI ではなく selectUnits が、順位の高いものから秒数に収まるだけ選ぶ（話や動作の途中で終わらないように）
 */
async function plan(frames: { t: number; file: string }[], speech: Speech[], duration: number, target: number, store: string | null, memo: string | null, rules: string[]): Promise<Plan> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of frames) {
    content.push({ type: "text", text: `${f.t.toFixed(1)}秒` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(f.file)).toString("base64") } });
  }
  content.push({
    type: "text",
    text: `${store ? `「${store}」（` : "（"}飲食店・美容室を営む会社の店）の Instagram リール用に、動画を編集します。上は元の動画（全${duration.toFixed(1)}秒）から一定の間隔で取ったコマです。
${speech.length ? `話している言葉の文字起こし（秒は元の動画の時刻）：\n${speech.map((s) => `${s.start.toFixed(1)}〜${s.end.toFixed(1)}秒「${s.text}」`).join("\n")}` : "話している言葉はありません（または読み取れません）。"}
${memo ? `担当者のメモ：「${memo}」` : ""}
${rules.length ? `\nこの担当者の編集ルール（必ず守る）：\n${rules.map((r) => `- ${r}`).join("\n")}\n` : ""}
仕上がりは ${Math.min(target, duration).toFixed(0)} 秒以内です。編集のしかた：
1. 動画を「それだけで意味が通るまとまり」に切り分ける。話している所は、文字起こしの文の区切り（start・end は文字起こしの秒に合わせる）で、1文〜数文をひとまとまりに。動作は、始まりから終わりまで（盛り付け始め〜盛り付け終わり、など）
2. まとまりに、大事な順の順位（priority：1 がいちばん大事。同じ順位があってよい）を付ける。順位の高いものから順に、${Math.min(target, duration).toFixed(0)} 秒に収まるだけ残すので、上位だけを並べても話が通じて、見て完結する動画になるように順位を付ける
3. 冒頭にふさわしいまとまり1つに role "opening"（目を引く・何の動画か分かる）、締めにふさわしいまとまり1つに role "ending"（店の雰囲気・仕上がり・あいさつなど）を付ける
4. 使わない方がよい所（動きのない所・ぶれた所・間延びした所・関係ない所・話の途中で切れる所）は、まとまりに入れない

次の JSON だけを返してください（前後に文を付けない）。
{
  "units": [ { "start": 開始秒, "end": 終了秒, "priority": 1〜9, "role": "opening" か "ending" か null, "caption": "そのまとまりに出すキャッチコピー（全角12文字以内。なければ null）", "emotion": "キャッチコピーの気持ち。${EMOTIONS.join("・")} のどれか" } ],
  "mood": "BGM の雰囲気。${MOODS.join("・")} のどれか",
  "title": "この動画の短い題（20文字以内）"
}
キャッチコピーの決まり：見る人が「行きたい」「食べたい」と思う短い言葉。3〜5個くらい。話しているまとまりには付けない（字幕と重なるため）。うそや大げさな表現（日本一 など）は使わない。emotion はその言葉で見る人に伝えたい気持ちで選ぶ（力強い＝迫力・驚き、やさしい＝あたたかさ・安心、楽しい＝わくわく・にぎやか、上品＝落ち着き・こだわり）。フォントがそれに合わせて変わる`,
  });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages: [{ role: "user", content }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { units?: Partial<Unit>[]; mood?: unknown; title?: unknown };
    return {
      units: (Array.isArray(j.units) ? j.units : []).map((u) => ({
        start: Number(u.start),
        end: Number(u.end),
        priority: Number(u.priority) || 5,
        role: u.role === "opening" || u.role === "ending" ? u.role : null,
        caption: typeof u.caption === "string" ? u.caption.slice(0, 24) : null,
        emotion: typeof u.emotion === "string" && EMOTIONS.includes(u.emotion) ? u.emotion : null,
      })),
      mood: typeof j.mood === "string" ? j.mood : "明るい",
      title: typeof j.title === "string" ? j.title.slice(0, 40) : "",
    };
  } catch {
    return { units: [], mood: "明るい", title: "" };
  }
}

/** できた動画を見る・保存するためのアドレス（1時間）。呼ぶ側で本人のものか確かめてから使う */
export async function resultUrls(resultPath: string, createdAt: string) {
  const bucket = createAdminClient().storage.from(REEL_BUCKET);
  const name = `reel_${createdAt.slice(0, 10).replace(/-/g, "")}_${createdAt.slice(11, 16).replace(":", "")}.mp4`;
  const [{ data: view }, { data: dl }] = await Promise.all([bucket.createSignedUrl(resultPath, 3600), bucket.createSignedUrl(resultPath, 3600, { download: name })]);
  return { url: view?.signedUrl ?? null, downloadUrl: dl?.signedUrl ?? null, fileName: name };
}

/** リールを1本作る（after() から呼ぶ。失敗したら理由を残す） */
export async function processReel(id: string) {
  const admin = createAdminClient();
  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  // どこに時間がかかったか（秒。plan に残して、遅いときに見直す）
  const timings: Record<string, number> = {};
  let t0 = Date.now();
  const lap = (k: string) => {
    timings[k] = Math.round((Date.now() - t0) / 100) / 10;
    t0 = Date.now();
  };
  try {
    const { data: r } = await admin.from("reels").select("id, chunk_count, target_seconds, bgm_mode, bgm_id, memo, store_id, staff_id").eq("id", id).single();
    if (!r) throw new Error("見つかりません");
    const [{ data: store }, { data: ruleRows }] = await Promise.all([
      r.store_id ? admin.from("stores").select("name").eq("id", r.store_id).single() : Promise.resolve({ data: null }),
      admin.from("reel_rules").select("body").eq("staff_id", r.staff_id).eq("is_active", true).order("sort_order").order("created_at"),
    ]);
    const rules = (ruleRows ?? []).map((x) => x.body);

    // 1. つなぐ
    await stage(id, "processing", "動画を読み込んでいます");
    const src = path.join(dir, "source");
    const out = createWriteStream(src);
    for (let i = 0; i < r.chunk_count; i++) {
      const { data: blob, error } = await admin.storage.from(REEL_BUCKET).download(`${id}/source.${i}`);
      if (error || !blob) throw new Error("動画を読めませんでした（もう一度上げてください）");
      const buf = Buffer.from(await blob.arrayBuffer());
      await new Promise<void>((ok, ng) => out.write(buf, (e) => (e ? ng(e) : ok())));
    }
    await new Promise<void>((ok) => out.end(ok));
    const probe = parseProbe(await ffmpeg(["-i", src], true));
    if (!probe.duration || !probe.width) throw new Error("動画として読めませんでした");
    lap("download");

    // 2. 文字起こし
    let speech: Speech[] = [];
    if (probe.hasAudio && process.env.OPENAI_API_KEY) {
      await stage(id, "processing", "話している言葉を文字にしています");
      const mp3 = path.join(dir, "audio.mp3");
      await ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3]);
      speech = await transcribe(mp3).catch(() => []);
    }
    lap("transcribe");

    // 3. AI がまとまりに切り分けて順位を付け、順位の高いものから秒数に収まるだけ残す
    await stage(id, "processing", "AIが見どころを選んでいます");
    const count = Math.min(36, Math.max(8, Math.round(probe.duration)));
    const frames = Array.from({ length: count }, (_, i) => ({ t: Math.min(probe.duration - 0.1, (probe.duration * (i + 0.5)) / count), file: path.join(dir, `f${i}.jpg`) }));
    for (let i = 0; i < frames.length; i += 6) {
      await Promise.all(frames.slice(i, i + 6).map((f) => ffmpeg(["-ss", f.t.toFixed(2), "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "6", f.file])));
    }
    lap("frames");
    const p = await plan(frames, speech, probe.duration, r.target_seconds, store?.name ?? null, r.memo, rules);
    const segs = selectUnits(p.units, probe.duration, r.target_seconds);
    const telops = buildTelops(segs, speech);
    lap("ai");

    // BGM：おまかせ＝雰囲気が合う曲、曲を選んだときはその曲、なしは付けない
    let bgmFile: string | null = null;
    if (r.bgm_mode !== "none") {
      let q = admin.from("reel_bgm").select("id, path, mood").eq("is_active", true);
      if (r.bgm_mode === "pick" && r.bgm_id) q = q.eq("id", r.bgm_id);
      const { data: tracks } = await q;
      const list = tracks ?? [];
      const pick = list.find((t) => t.mood === p.mood) ?? list[Math.floor(Math.random() * list.length)];
      if (pick) {
        const { data: blob } = await admin.storage.from(REEL_BUCKET).download(pick.path);
        if (blob) {
          bgmFile = path.join(dir, `bgm${path.extname(pick.path) || ".mp3"}`);
          await writeFile(bgmFile, Buffer.from(await blob.arrayBuffer()));
        }
      }
    }

    // 4. 書き出す
    const planLog = { units: p.units, segments: segs, mood: p.mood, title: p.title, speech: speech.length, rules: rules.length, source: { duration: probe.duration, width: probe.width, height: probe.height }, timings };
    await stage(id, "processing", "動画を書き出しています", { plan: planLog });
    const telopFiles = await Promise.all(
      telops.map(async (t, i) => {
        const file = path.join(dir, `t${i}.txt`);
        await writeFile(file, t.text);
        return { start: t.start, end: t.end, file, kind: t.kind, font: t.font };
      }),
    );
    const { filter, total } = buildFilter({ segs, portrait: probe.height >= probe.width, hasAudio: probe.hasAudio, telops: telopFiles, fontDir: FONT_DIR, bgm: !!bgmFile, speechMain: speech.length > 0 });
    const filterFile = path.join(dir, "filter.txt");
    await writeFile(filterFile, filter);
    const inputs: string[] = [];
    for (const s of segs) inputs.push("-ss", s.start.toFixed(2), "-t", (s.end - s.start).toFixed(2), "-i", src);
    if (!probe.hasAudio) for (const s of segs) inputs.push("-f", "lavfi", "-t", (s.end - s.start).toFixed(2), "-i", "anullsrc=r=48000:cl=stereo");
    if (bgmFile) inputs.push("-stream_loop", "-1", "-i", bgmFile);
    const result = path.join(dir, "reel.mp4");
    await ffmpeg([
      ...inputs,
      "-filter_complex_script", filterFile,
      "-map", "[vout]", "-map", "[aout]",
      "-t", total.toFixed(2),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      result,
    ]);
    lap("render");
    const resultPath = `${id}/reel.mp4`;
    const { error: upErr } = await admin.storage.from(REEL_BUCKET).upload(resultPath, await readFile(result), { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error("できた動画を保存できませんでした");
    lap("upload");
    await stage(id, "done", "できました", { result_path: resultPath, duration: total, title: p.title || null, plan: planLog });
    // 元の動画は消す（容量を食うため。できた動画は残す）
    await admin.storage.from(REEL_BUCKET).remove(Array.from({ length: r.chunk_count }, (_, i) => `${id}/source.${i}`));
  } catch (e) {
    await stage(id, "error", "作れませんでした", { error: (e as Error).message.slice(0, 500), plan: { timings } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 今週（月曜0時〜、日本時間）作った本数。作れなかったもの・送っている途中のものは数えない */
export async function madeThisWeek(staffId: string) {
  const { count } = await createAdminClient()
    .from("reels")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .in("status", ["processing", "done"])
    .gte("created_at", weekStartJST(new Date()));
  return count ?? 0;
}
