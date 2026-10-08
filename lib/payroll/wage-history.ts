/** 給与設定の履歴から、その日・その月に使う設定を選ぶ（画面とサーバーで共通、データベースには触らない） */
export type WageRow = { valid_from: string; valid_to: string | null; employment_type: string; amount: number };

/** その日に有効な設定 */
export const wageOn = (rows: WageRow[], date: string) => rows.find((r) => r.valid_from <= date && (!r.valid_to || r.valid_to >= date)) ?? null;

/** 月（from〜to）の中で、設定ごとの区切り。設定がない日は含めない */
export function segments(rows: WageRow[], from: string, to: string): { from: string; to: string; row: WageRow }[] {
  return rows
    .filter((r) => r.valid_from <= to && (!r.valid_to || r.valid_to >= from))
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
    .map((r) => ({ from: r.valid_from > from ? r.valid_from : from, to: r.valid_to && r.valid_to < to ? r.valid_to : to, row: r }));
}

/** 暦日の日数（両端を含む） */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;

/** 新しい行を足したとき、前の行の終わりの日（開始日の前日） */
export const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
