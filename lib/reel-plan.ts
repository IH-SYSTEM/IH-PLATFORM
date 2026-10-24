// リール作成（2026-10-25）の、秒数・切り出し・テロップの計算と、ffmpeg のフィルタの組み立て。
// テストから Node で直接読むため、ここでは他のファイルを import しない

export type Seg = { start: number; end: number; caption?: string | null };
export type Speech = { start: number; end: number; text: string };
export type Telop = { start: number; end: number; text: string; kind: "catch" | "speech" };

export const W = 1080;
export const H = 1920;
const MIN_SEG = 0.8;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * AI が選んだ場面を、元の動画の長さの中に収め、重なりを除いて、合計を仕上がりの秒数にそろえる。
 * 足りなければ前後に少しずつ広げ、多ければ長い場面から縮める。元の動画が短ければ、元の長さまで
 */
export function fitSegments(raw: Seg[], duration: number, target: number): Seg[] {
  const goal = Math.min(target, duration);
  let segs = raw
    .map((s) => ({ ...s, start: Math.max(0, Number(s.start) || 0), end: Math.min(duration, Number(s.end) || 0) }))
    .filter((s) => s.end - s.start >= 0.3)
    .sort((a, b) => a.start - b.start);
  // 重なりを除く
  const merged: Seg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
      if (!last.caption && s.caption) last.caption = s.caption;
    } else merged.push({ ...s });
  }
  segs = merged;
  if (!segs.length) segs = [{ start: 0, end: goal }];

  const total = () => segs.reduce((a, s) => a + (s.end - s.start), 0);
  // 多すぎる：長い場面から縮める（真ん中を残す）
  for (let guard = 0; total() > goal + 0.01 && guard < 1000; guard++) {
    const over = total() - goal;
    const longest = segs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const len = longest.end - longest.start;
    if (len - MIN_SEG <= 0.01) {
      // どれも最短なら、いちばん後ろの場面をはずす
      segs = segs.filter((s) => s !== segs[segs.length - 1]);
      if (!segs.length) return [{ start: 0, end: round2(goal) }];
      continue;
    }
    const cut = Math.min(over, len - MIN_SEG);
    longest.start += cut / 2;
    longest.end -= cut / 2;
  }
  // 足りない：場面の前後を、すき間の範囲で広げる
  for (let guard = 0; total() < goal - 0.01 && guard < 50; guard++) {
    const need = goal - total();
    let grew = false;
    for (let i = 0; i < segs.length && total() < goal - 0.01; i++) {
      const s = segs[i];
      const lo = i ? segs[i - 1].end : 0;
      const hi = i < segs.length - 1 ? segs[i + 1].start : duration;
      const room = s.start - lo + (hi - s.end);
      if (room <= 0.01) continue;
      const add = Math.min(room, need / segs.length + 0.5, goal - total());
      const back = Math.min(s.start - lo, add / 2);
      s.start -= back;
      s.end = Math.min(hi, s.end + (add - back));
      grew = true;
    }
    if (!grew) break;
  }
  return segs.map((s) => ({ ...s, start: round2(s.start), end: round2(s.end) }));
}

/** 元の動画の時刻 → 仕上がりの時刻（その時刻が切り出した場面に入っていなければ null） */
export function toOutputTime(segs: Seg[], t: number): number | null {
  let acc = 0;
  for (const s of segs) {
    if (t >= s.start && t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return null;
}

/** 日本語を1行 n 文字までで折り返す（句読点・スペースで切れるならそこで） */
export function wrapJa(text: string, n = 13): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let rest = t;
  while (rest.length > n) {
    let cut = n;
    for (let i = n; i >= Math.ceil(n * 0.6); i--) {
      if ("、。！？!? ".includes(rest[i - 1])) {
        cut = i;
        break;
      }
    }
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) lines.push(rest);
  return lines;
}

/**
 * テロップを作る。
 *   catch  … 場面ごとのキャッチコピー（AI が映像を見て付けたもの）。その場面のあいだ、画面の上のほうに出す
 *   speech … 話した言葉の字幕。切り出した場面に入っている分だけ、仕上がりの時刻に直して画面の下に出す。長ければ2行ずつに分ける
 */
export function buildTelops(segs: Seg[], speech: Speech[]): Telop[] {
  const out: Telop[] = [];
  let acc = 0;
  for (const s of segs) {
    const len = s.end - s.start;
    if (s.caption?.trim()) out.push({ start: round2(acc + 0.1), end: round2(acc + len - 0.05), text: wrapJa(s.caption.trim(), 11).slice(0, 2).join("\n"), kind: "catch" });
    for (const sp of speech) {
      const a = Math.max(sp.start, s.start);
      const b = Math.min(sp.end, s.end);
      if (b - a < 0.3 || !sp.text.trim()) continue;
      const lines = wrapJa(sp.text, 14);
      const chunks: string[] = [];
      for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2).join("\n"));
      const per = (b - a) / chunks.length;
      chunks.forEach((c, i) => out.push({ start: round2(acc + (a - s.start) + per * i), end: round2(acc + (a - s.start) + per * (i + 1)), text: c, kind: "speech" }));
    }
    acc += len;
  }
  return out;
}

/** 縦長（9:16）にそろえる。縦の動画は切り抜き、横の動画はぼかした背景の上に全体を置く */
export function fitVertical(input: string, label: string, portrait: boolean) {
  const base = `fps=30,format=yuv420p,setsar=1`;
  if (portrait) return `[${input}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${base}[${label}]`;
  return (
    `[${input}]split[${label}b][${label}f];` +
    `[${label}b]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},boxblur=8:2,scale=${W}:${H}[${label}bb];` +
    `[${label}f]scale=${W}:${H}:force_original_aspect_ratio=decrease[${label}ff];` +
    `[${label}bb][${label}ff]overlay=(W-w)/2:(H-h)/2,${base}[${label}]`
  );
}

/**
 * ffmpeg の filter_complex を組み立てる。入力の順番：
 *   0..n-1 … 場面ごとの動画（-ss/-t で切り出したもの）
 *   n..2n-1 … 音のない動画のときだけ、場面ごとの無音
 *   最後   … BGM（あれば。-stream_loop -1 で繰り返す）
 * テロップは textfile（1枚ずつのテキストファイル）で渡す
 */
export function buildFilter(opts: {
  segs: Seg[];
  portrait: boolean;
  hasAudio: boolean;
  telops: { start: number; end: number; file: string; kind: "catch" | "speech" }[];
  font: string;
  bgm: boolean;
  speechMain: boolean; // 話している動画なら、元の音を大きく・BGMを小さく
}) {
  const { segs, portrait, hasAudio, telops, font, bgm, speechMain } = opts;
  const n = segs.length;
  const total = round2(segs.reduce((a, s) => a + (s.end - s.start), 0));
  const parts: string[] = [];
  segs.forEach((_, i) => {
    parts.push(fitVertical(`${i}:v`, `v${i}`, portrait));
    const a = hasAudio ? `${i}:a` : `${n + i}:a`;
    parts.push(`[${a}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  });
  parts.push(`${segs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vc][ac]`);

  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  let v = "vc";
  telops.forEach((t, i) => {
    const big = t.kind === "catch";
    const style = big
      ? `fontsize=88:fontcolor=white:borderw=8:bordercolor=black@0.85:line_spacing=18:y=h*0.16`
      : `fontsize=60:fontcolor=white:borderw=6:bordercolor=black@0.9:line_spacing=12:y=h*0.74`;
    parts.push(`[${v}]drawtext=fontfile='${esc(font)}':textfile='${esc(t.file)}':x=(w-text_w)/2:${style}:enable='between(t,${t.start},${t.end})'[t${i}]`);
    v = `t${i}`;
  });
  parts.push(`[${v}]null[vout]`);

  if (bgm) {
    const bi = hasAudio ? n : 2 * n;
    const voice = speechMain ? 1.0 : 0.35;
    const music = speechMain ? 0.18 : 0.7;
    const fade = Math.min(1.5, total / 4);
    parts.push(`[ac]volume=${voice}[av]`);
    parts.push(`[${bi}:a]atrim=0:${total},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.5,afade=t=out:st=${round2(total - fade)}:d=${fade},volume=${music}[am]`);
    parts.push(`[av][am]amix=inputs=2:duration=first:normalize=0[aout]`);
  } else parts.push(`[ac]anull[aout]`);
  return { filter: parts.join(";"), total };
}

/** ffmpeg の -i の出力から、長さ・縦横・回転・音の有無を読む */
export function parseProbe(stderr: string) {
  const d = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const v = stderr.match(/Stream #[^\n]*Video:[^\n]*?\s(\d{2,5})x(\d{2,5})[\s,]/);
  let width = v ? Number(v[1]) : 0;
  let height = v ? Number(v[2]) : 0;
  const rot = stderr.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) ?? stderr.match(/rotate\s*:\s*(-?\d+)/);
  if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [width, height] = [height, width];
  return { duration, width, height, hasAudio: /Stream #[^\n]*Audio:/.test(stderr) };
}
