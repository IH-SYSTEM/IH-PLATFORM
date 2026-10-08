// シフト希望の期間と締切。日付だけを扱うので、どの時差でもずれないよう UTC 正午で計算する
// テストから Node で直接読むため、ここでは他のファイルを import しない
//
//   アルバイト … 週単位（月曜始まり）。4週先まで、その週が始まる前日まで出せる。確定＝前週の水曜24時まで
//               （確定のあとに出した希望も消さず、店長の画面に「待機」として残す）
//   社員       … 月単位。提出＝前月15日、確定＝前月20日

const DAY_MS = 86_400_000;
const at = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);
const ymdOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOf(at(ymd) + n * DAY_MS);

/** シフト希望を月単位で出す雇用区分（正社員・契約社員）。役員・業務委託はシフト希望の対象外 */
export const MONTHLY_ROLES = ["fulltime", "contract"] as const;
export const WEEKLY_ROLES = ["parttime"] as const;

export type PeriodType = "week" | "month";

export function periodTypeFor(role: string | null | undefined): PeriodType | null {
  if ((MONTHLY_ROLES as readonly string[]).includes(role ?? "")) return "month";
  if ((WEEKLY_ROLES as readonly string[]).includes(role ?? "")) return "week";
  return null;
}

/** その日を含む週の月曜 */
export function mondayOf(ymd: string): string {
  const dow = new Date(at(ymd)).getUTCDay(); // 0=日
  return addDays(ymd, -((dow + 6) % 7));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthDays(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`);
}

export function weekDeadlines(monday: string) {
  return { submit: addDays(monday, -8), decide: addDays(monday, -5) };
}

export function monthDeadlines(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { submit: `${prev}-15`, decide: `${prev}-20` };
}

export const nextMonth = (yearMonth: string) => {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

export type Period = { type: PeriodType; start: string; days: string[]; submit: string; decide: string; label: string };

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

export function weekPeriod(monday: string): Period {
  const days = weekDays(monday);
  return { type: "week", start: monday, days, ...weekDeadlines(monday), label: `${md(days[0])}〜${md(days[6])}` };
}

export function monthPeriod(yearMonth: string): Period {
  return { type: "month", start: `${yearMonth}-01`, days: monthDays(yearMonth), ...monthDeadlines(yearMonth), label: `${Number(yearMonth.slice(5, 7))}月` };
}

/** アルバイトが希望を出せる週：まだ始まっていない週から4週ぶん（2026-10-08 黒田さん決定） */
export function partTimeWeeks(today: string, count = 4): Period[] {
  let monday = mondayOf(today);
  if (at(monday) <= at(today)) monday = addDays(monday, 7);
  return Array.from({ length: count }, (_, i) => {
    const p = weekPeriod(addDays(monday, i * 7));
    return { ...p, submit: addDays(p.start, -1) }; // 提出はその週が始まる前日（日曜）まで
  });
}

// 急募の理由。乱用を防ぐため必須
export const URGENT_REASONS = ["予定していたスタッフがトラブルで来られなくなった", "急な大型予約が入った", "その他"] as const;

/** 急募を使える日か：今日から3日後まで（3日前から使える特別なボタン） */
export const URGENT_DAYS = 3;
export function canCallUrgent(date: string, today: string) {
  const diff = Math.round((at(date) - at(today)) / DAY_MS);
  return diff >= 0 && diff <= URGENT_DAYS;
}

/** いま希望を出せる週（提出期限をまだ過ぎていない週から count 週ぶん） */
export function openWeeks(today: string, count = 4): Period[] {
  let monday = mondayOf(today);
  while (at(today) > at(weekDeadlines(monday).submit)) monday = addDays(monday, 7);
  return Array.from({ length: count }, (_, i) => weekPeriod(addDays(monday, i * 7)));
}

/** いま希望を出せる月（提出期限をまだ過ぎていない月から count か月ぶん） */
export function openMonths(today: string, count = 2): Period[] {
  let ym = today.slice(0, 7);
  while (at(today) > at(monthDeadlines(ym).submit)) ym = nextMonth(ym);
  const out: Period[] = [];
  for (let i = 0; i < count; i++, ym = nextMonth(ym)) out.push(monthPeriod(ym));
  return out;
}

/** 締切を過ぎたか（締切日の終わりまでは出せる） */
export const isPast = (deadline: string, today: string) => at(today) > at(deadline);

/** 'HH:MM' の開始・終了。終了が開始以下なら日をまたぐ（19:30〜00:30） */
export const crossesMidnight = (start: string, end: string) => end <= start;
