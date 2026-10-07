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

/**
 * 打刻時刻の表示。基準の営業日より後の日付なら「翌」を付ける。
 * 00:30 と 翌0:30 を見分けられないと、8/31 の勤務が 9/1 に入っているように見えるため。
 * 2日以上離れていれば日付そのものを出す（打刻ミスを誤魔化さない）
 */
export function toJSTTimeLabel(iso: string | null | undefined, baseDate: string): string {
  const hhmm = toJSTTimeString(iso);
  if (!iso || hhmm === "—") return hhmm;
  const onDate = toJSTDateString(new Date(iso));
  if (onDate === baseDate) return hhmm;
  const diff = Math.round((Date.parse(`${onDate}T00:00:00Z`) - Date.parse(`${baseDate}T00:00:00Z`)) / 86400000);
  if (diff === 1) return `翌${hhmm}`;
  if (diff === -1) return `前${hhmm}`;
  return `${Number(onDate.slice(5, 7))}/${Number(onDate.slice(8, 10))} ${hhmm}`;
}

/** 実働（分）＝退勤−出勤−休憩。未退勤や逆転は null */
export function workedMinutes(checkin: string | null, checkout: string | null, breakMinutes = 0): number | null {
  if (!checkin || !checkout) return null;
  const diff = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 60000);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return Math.max(diff - Math.max(breakMinutes, 0), 0);
}

/** 分を「7時間30分」に */
export function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  return `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, "0")}分`;
}

/** 'YYYY-MM' → その月の初日と末日（'YYYY-MM-DD'）。日付だけの計算なので UTC で数える */
export function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

/** 'YYYY-MM-DD' と 'HH:MM'（JST）→ UTC の ISO 文字列 */
export function jstDateTimeToISO(ymd: string, hhmm: string): string {
  return new Date(`${ymd}T${hhmm}:00+09:00`).toISOString();
}

/**
 * 退勤の 'HH:MM' → UTC の ISO。★日をまたぐ勤務の核心★
 * 「00:30」を営業日の日付とそのまま組み合わせると出勤より前になり、勤務時間が出せずその日が給与から消える。
 * 出勤より後になるまで1日進める。日をまたぐ入力を受けるところは、必ずここを通す
 */
export function jstCheckoutToISO(ymd: string, hhmm: string, checkin: string | null): string {
  const iso = jstDateTimeToISO(ymd, hhmm);
  if (!checkin) return iso;
  const inMs = Date.parse(checkin);
  if (!Number.isFinite(inMs)) return iso;
  const out = Date.parse(iso);
  return out > inMs ? iso : new Date(out + 24 * 60 * 60 * 1000).toISOString();
}
