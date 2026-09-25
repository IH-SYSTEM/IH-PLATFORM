export type Period = { year: number; month: number };

export function shiftPeriod(p: Period, delta: number): Period {
  const i = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

// 既定は前月分（当月に前月分の給与を計算する運用）
export function defaultPeriod(): Period {
  const jst = new Date(Date.now() + 9 * 3600_000);
  return shiftPeriod({ year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 }, -1);
}

export function parsePeriod(ym: unknown): Period {
  if (typeof ym === "string") {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] };
  }
  return defaultPeriod();
}

export const ym = (p: Period) => `${p.year}-${String(p.month).padStart(2, "0")}`;
export const periodLabel = (p: Period) => `${p.year}年${p.month}月`;
