// ワークボードのタイムライン（何時に誰が入っているか）の計算。時刻は '19:30' や '19:30:00' の文字列で受け取り、0時からの分で扱う
// テストから Node で直接読むため、ここでは他のファイルを import しない

/** '19:30:00' → 1170（分）。空なら null */
export const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const m = Number(t.slice(3, 5));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** 始まりと終わり（分）。終わりが始まり以前なら日をまたぐので +24時間 */
export function span(start: string | null | undefined, end: string | null | undefined): [number, number] | null {
  const a = toMin(start);
  let b = toMin(end);
  if (a === null || b === null) return null;
  if (b <= a) b += 1440;
  return [a, b];
}

/**
 * 表に出す時間の幅（分、1時間単位）。店の開店〜閉店を基本にして、はみ出すシフトがあれば広げる。
 * 開店・閉店がなく、シフトもなければ 9時〜22時
 */
export function axisRange(open: string | null | undefined, close: string | null | undefined, spans: [number, number][]): [number, number] {
  const store = span(open, close);
  let lo = store?.[0] ?? Infinity;
  let hi = store?.[1] ?? -Infinity;
  for (const [a, b] of spans) {
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [9 * 60, 22 * 60];
  return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
}

/** 幅の中での位置（左端と幅、%）。幅の外にはみ出した分は切る */
export function barPos([a, b]: [number, number], [lo, hi]: [number, number]): { left: number; width: number } {
  const total = hi - lo || 1;
  const s = Math.max(a, lo);
  const e = Math.min(b, hi);
  return { left: ((s - lo) / total) * 100, width: (Math.max(0, e - s) / total) * 100 };
}

/** 1時間ごとの区切り（分）。lo〜hi のうち hi を除く */
export const hourTicks = ([lo, hi]: [number, number]) => Array.from({ length: Math.max(0, (hi - lo) / 60) }, (_, i) => lo + i * 60);

/** その1時間（h〜h+60分）に少しでも入っている人数 */
export const headcount = (spans: [number, number][], h: number) => spans.filter(([a, b]) => a < h + 60 && b > h).length;

/** 分 → '9' や '25'（日をまたぐと24以上）。表の見出し用 */
export const hourLabel = (m: number) => String(Math.floor(m / 60));
