// 有給休暇の計算（2026-10-16 黒田さん決定）。テストから Node で直接読むため、ここでは他のファイルを import しない。日付は 'YYYY-MM-DD'
//
//   付与    … 正社員。入社日から法律どおり：6か月で10日、1年6か月で11日、2年6か月で12日、3年6か月で14日、4年6か月で16日、5年6か月で18日、6年6か月以降は毎年20日
//   時効    … 付与から2年
//   使い方  … 古い付与から先に使う
//   はじめの残高 … 経理が「この日の時点で残り◯日」を入れたら、それより前の付与と使用は数えず、その残りから始める
//                  （その残りは、その日までの最後の付与の時効と同じ日に消える、とみなす）
//   年5日   … 10日以上の付与があった日から1年のあいだに、5日取らせる義務
//   申請の期限 … 1日＝2週間前、連続2〜4日＝1か月前、連続5日以上＝2か月前

const STEPS = [10, 11, 12, 14, 16, 18, 20];

const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function addMonths(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.toISOString().slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export const addDays = (d: string, n: number) => ymd(at(d) + n * 86_400_000);

export type Grant = { date: string; days: number; expires: string };

/** 入社日から until までの付与（法律どおり） */
export function statutoryGrants(hireDate: string, until: string): Grant[] {
  const out: Grant[] = [];
  for (let i = 0; ; i++) {
    const date = addMonths(hireDate, 6 + i * 12);
    if (date > until) break;
    out.push({ date, days: STEPS[Math.min(i, STEPS.length - 1)], expires: addMonths(date, 24) });
  }
  return out;
}

export type Balance = {
  remaining: number; // 今日の残り
  grants: (Grant & { left: number })[]; // 今日の時点で使える付与（古い順）と、それぞれの残り
  nextGrant: { date: string; days: number } | null;
  obligation: { from: string; to: string; used: number; need: number } | null; // 年5日の義務の期間と、その間に取った日数
};

/**
 * 残りの日数。used は有給を取った日（シフトの「有給」）。baseline は経理が入れた「はじめの残高」
 */
export function paidLeaveBalance(opts: { hireDate: string; today: string; used: string[]; baseline?: { asOf: string; remaining: number } | null }): Balance {
  const { hireDate, today, baseline } = opts;
  const all = statutoryGrants(hireDate, addMonths(today, 13));
  let grants: Grant[] = all.filter((g) => g.date <= today);
  let used = [...opts.used].sort();
  if (baseline) {
    const before = grants.filter((g) => g.date <= baseline.asOf);
    const lastExpiry = before.length ? before[before.length - 1].expires : addMonths(baseline.asOf, 24);
    grants = [{ date: baseline.asOf, days: baseline.remaining, expires: lastExpiry }, ...grants.filter((g) => g.date > baseline.asOf)];
    used = used.filter((d) => d > baseline.asOf);
  }
  const pool = grants.map((g) => ({ ...g, left: g.days }));
  for (const d of used) {
    const g = pool.find((x) => x.date <= d && d < x.expires && x.left > 0);
    if (g) g.left -= 1;
  }
  const alive = pool.filter((g) => g.expires > today && g.left > 0);
  const next = all.find((g) => g.date > today) ?? null;
  // 年5日の義務：今日を含む「10日以上の付与の日から1年」
  const base = [...all].reverse().find((g) => g.date <= today && g.days >= 10 && today < addMonths(g.date, 12));
  const obligation = base
    ? { from: base.date, to: addDays(addMonths(base.date, 12), -1), used: opts.used.filter((d) => d >= base.date && d < addMonths(base.date, 12)).length, need: 5 }
    : null;
  return { remaining: alive.reduce((a, g) => a + g.left, 0), grants: alive, nextGrant: next ? { date: next.date, days: next.days } : null, obligation };
}

/** 申請の期限（この日までに出す）。1日＝2週間前、連続2〜4日＝1か月前、連続5日以上＝2か月前 */
export function requestDeadline(start: string, days: number) {
  if (days >= 5) return addMonths(start, -2);
  if (days >= 2) return addMonths(start, -1);
  return addDays(start, -14);
}

/** 期間の日数（はじめと終わりを含む） */
export const spanDays = (start: string, end: string) => Math.round((at(end) - at(start)) / 86_400_000) + 1;
