// 勤怠の日付の約束事。DB の date は JST の営業日、時刻は UTC。素の toISOString().slice(0, 10) で日付を作らない
// （サーバーは UTC で動くので、日本の 0〜9時が前日になる）
// テストから Node で直接読むため、ここでは他のファイルを import しない

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 営業日の切り替え時刻（JST）。深夜2時の退勤は前日の営業日に属する */
export const BUSINESS_DAY_START_HOUR = 5;

/** UTC の Date を JST の 'YYYY-MM-DD' に */
export function toJSTDateString(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** その時刻が属する営業日（JST の 'YYYY-MM-DD'）。打刻と集計はすべてこちらを使う */
export function businessDayJST(now: Date = new Date()): string {
  return toJSTDateString(new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000));
}

/** UTC の ISO 文字列を JST の 'HH:MM' に */
export function toJSTTimeString(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}
