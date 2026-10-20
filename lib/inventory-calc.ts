// 棚卸しの計算（2026-10-20 黒田さん）。テストから Node で直接読むため、ここでは他のファイルを import しない
//
//   原価 ＝ 期首の在庫 ＋ 期間の仕入れ − 今の在庫（金額は税込の仕入れ値）
//   棚卸し表に出す品目 ＝ 期首に残っていた品目 ＋ 期間に買った品目（「数える」にした品目だけ）
//   在庫の金額 ＝ 数えた数 × 品目の単価（数える単位あたり。最後に仕入れた値）

export type CalcItem = { id: string; name: string; category: string; count_unit: string; per_purchase: number; unit_cost: number | null; track: boolean };
export type Opening = { item_id: string; qty: number; unit_cost: number | null };
export type PurchaseLine = { item_id: string | null; qty: number; amount: number }; // qty は伝票の数量（仕入れの単位）

/** 伝票の行から、数える単位あたりの単価（税込） */
export const unitCostOf = (line: { qty: number; amount: number }, perPurchase: number) => (line.qty > 0 ? line.amount / (line.qty * perPurchase) : null);

export type SheetRow = { item: CalcItem; opening: number; bought: number; expected: number; unitCost: number | null };

/** 棚卸し表の行。期首に残っていた品目と、期間に買った品目。並びは区分→名前 */
export function sheetRows(items: CalcItem[], opening: Opening[], purchases: PurchaseLine[]): SheetRow[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const open = new Map(opening.map((o) => [o.item_id, o]));
  const bought = new Map<string, number>();
  for (const p of purchases) if (p.item_id) bought.set(p.item_id, (bought.get(p.item_id) ?? 0) + p.qty * (byId.get(p.item_id)?.per_purchase ?? 1));
  const ids = new Set([...[...open.values()].filter((o) => o.qty > 0).map((o) => o.item_id), ...bought.keys()]);
  const order = ["食材", "酒", "飲料", "調味料", "冷凍品", "乾物", "消耗品", "その他"];
  return [...ids]
    .map((id) => byId.get(id))
    .filter((i): i is CalcItem => !!i && i.track)
    .map((item) => {
      const o = open.get(item.id)?.qty ?? 0;
      const b = round(bought.get(item.id) ?? 0);
      return { item, opening: o, bought: b, expected: round(o + b), unitCost: item.unit_cost ?? open.get(item.id)?.unit_cost ?? null };
    })
    .sort((a, b) => order.indexOf(a.item.category) - order.indexOf(b.item.category) || a.item.name.localeCompare(b.item.name, "ja"));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** 在庫の金額（円） */
export const stockValue = (lines: { qty: number; unit_cost: number | null }[]) => Math.round(lines.reduce((a, l) => a + l.qty * (l.unit_cost ?? 0), 0));

/** 原価と原価率。sales が 0 なら率は null */
export function costOf(opts: { openingValue: number; purchases: number; stockNow: number; sales: number }) {
  const cost = opts.openingValue + opts.purchases - opts.stockNow;
  return { cost, rate: opts.sales > 0 ? cost / opts.sales : null };
}
