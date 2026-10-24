import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { buildFilter, buildTelops, fitSegments, parseProbe, type Seg, type Speech } from "@/lib/reel-plan";
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

const FONT = path.join(process.cwd(), "assets/fonts/NotoSansJP_400Regular.ttf");
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

type Plan = { segments: Seg[]; mood: string; title: string };

/** AI が見どころの場面・キャッチコピー・BGM の雰囲気を決める */
async function plan(frames: { t: number; file: string }[], speech: Speech[], duration: number, target: number, store: string | null, memo: string | null): Promise<Plan> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of frames) {
    content.push({ type: "text", text: `${f.t.toFixed(1)}秒` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(f.file)).toString("base64") } });
  }
  content.push({
    type: "text",
    text: `${store ? `「${store}」（` : "（"}飲食店・美容室を営む会社の店）の Instagram リール用に、動画を編集します。上は元の動画（全${duration.toFixed(1)}秒）から一定の間隔で取ったコマです。
${speech.length ? `話している言葉（秒は元の動画の時刻）：\n${speech.map((s) => `${s.start.toFixed(1)}〜${s.end.toFixed(1)}秒「${s.text}」`).join("\n")}` : "話している言葉はありません（または読み取れません）。"}
${memo ? `担当者のメモ：「${memo}」` : ""}

仕上がりは ${Math.min(target, duration).toFixed(0)} 秒です。次の JSON だけを返してください（前後に文を付けない）。
{
  "segments": [ { "start": 元の動画の開始秒, "end": 終了秒, "caption": "その場面に出すキャッチコピー（全角12文字以内。なければ null）" } ],
  "mood": "BGM の雰囲気。${MOODS.join("・")} のどれか",
  "title": "この動画の短い題（20文字以内）"
}
決まり：
- 見どころ（料理の湯気・盛り付け・仕上がり・笑顔・店の雰囲気・before/after など）を残し、動きのない所・ぶれた所・間延びした所・関係ない所を切る
- segments は時刻の順、重ならないように。1場面は1.5〜6秒くらい。合計がちょうど仕上がりの秒数になるように
- 話している場面を使うときは、言葉の途中で切らない（話の区切りで切る）
- 最初の2秒で目を引く場面を置く。最後は店の雰囲気や仕上がりなど、締めになる場面
- キャッチコピーは、見る人が「行きたい」と思う短い言葉。全部の場面に付けなくてよい（3〜5個くらい）。話している場面には付けない（字幕と重なるため）。うそや大げさな表現（日本一 など）は使わない`,
  });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages: [{ role: "user", content }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<Plan>;
    return {
      segments: (Array.isArray(j.segments) ? j.segments : []).map((s) => ({ start: Number(s.start), end: Number(s.end), caption: typeof s.caption === "string" ? s.caption.slice(0, 24) : null })),
      mood: typeof j.mood === "string" ? j.mood : "明るい",
      title: typeof j.title === "string" ? j.title.slice(0, 40) : "",
    };
  } catch {
    return { segments: [], mood: "明るい", title: "" };
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
  try {
    const { data: r } = await admin.from("reels").select("id, chunk_count, target_seconds, bgm_mode, bgm_id, memo, store_id, staff_id").eq("id", id).single();
    if (!r) throw new Error("見つかりません");
    const { data: store } = r.store_id ? await admin.from("stores").select("name").eq("id", r.store_id).single() : { data: null };

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

    // 2. 文字起こし
    let speech: Speech[] = [];
    if (probe.hasAudio && process.env.OPENAI_API_KEY) {
      await stage(id, "processing", "話している言葉を文字にしています");
      const mp3 = path.join(dir, "audio.mp3");
      await ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3]);
      speech = await transcribe(mp3).catch(() => []);
    }

    // 3. AI が場面を選ぶ
    await stage(id, "processing", "AIが見どころを選んでいます");
    const count = Math.min(36, Math.max(8, Math.round(probe.duration)));
    const frames = Array.from({ length: count }, (_, i) => ({ t: Math.min(probe.duration - 0.1, (probe.duration * (i + 0.5)) / count), file: path.join(dir, `f${i}.jpg`) }));
    for (let i = 0; i < frames.length; i += 6) {
      await Promise.all(frames.slice(i, i + 6).map((f) => ffmpeg(["-ss", f.t.toFixed(2), "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "6", f.file])));
    }
    const p = await plan(frames, speech, probe.duration, r.target_seconds, store?.name ?? null, r.memo);
    const segs = fitSegments(p.segments, probe.duration, r.target_seconds);
    const telops = buildTelops(segs, speech);

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
    await stage(id, "processing", "動画を書き出しています", { plan: { segments: segs, mood: p.mood, title: p.title, speech: speech.length } });
    const telopFiles = await Promise.all(
      telops.map(async (t, i) => {
        const file = path.join(dir, `t${i}.txt`);
        await writeFile(file, t.text);
        return { start: t.start, end: t.end, file, kind: t.kind };
      }),
    );
    const { filter, total } = buildFilter({ segs, portrait: probe.height >= probe.width, hasAudio: probe.hasAudio, telops: telopFiles, font: FONT, bgm: !!bgmFile, speechMain: speech.length > 0 });
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
    const resultPath = `${id}/reel.mp4`;
    const { error: upErr } = await admin.storage.from(REEL_BUCKET).upload(resultPath, await readFile(result), { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error("できた動画を保存できませんでした");
    await stage(id, "done", "できました", { result_path: resultPath, duration: total, title: p.title || null });
    // 元の動画は消す（容量を食うため。できた動画は残す）
    await admin.storage.from(REEL_BUCKET).remove(Array.from({ length: r.chunk_count }, (_, i) => `${id}/source.${i}`));
  } catch (e) {
    await stage(id, "error", "作れませんでした", { error: (e as Error).message.slice(0, 500) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
