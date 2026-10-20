import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, sheetRows, stockValue, unitCostOf, type CalcItem } from "../lib/inventory-calc.ts";

const item = (id: string, over: Partial<CalcItem> = {}): CalcItem => ({ id, name: id, category: "食材", count_unit: "個", per_purchase: 1, unit_cost: 100, track: true, ...over });

test("棚卸し表 — 期首に残っていた品目と、期間に買った品目が出る。0になったものは出ない", () => {
  const items = [item("鶏もも"), item("ビール", { category: "酒", per_purchase: 24 }), item("ねぎ"), item("野菜", { track: false })];
  const rows = sheetRows(
    items,
    [
      { item_id: "鶏もも", qty: 3, unit_cost: 100 },
      { item_id: "ねぎ", qty: 0, unit_cost: 50 },
    ],
    [
      { item_id: "ビール", qty: 2, amount: 9600 }, // 2ケース＝48本
      { item_id: "野菜", qty: 5, amount: 1000 }, // 数えない
      { item_id: null, qty: 1, amount: 500 }, // 品目なし
    ],
  );
  assert.deepEqual(
    rows.map((r) => [r.item.name, r.opening, r.bought, r.expected]),
    [
      ["鶏もも", 3, 0, 3],
      ["ビール", 0, 48, 48],
    ],
  );
});

test("単価・在庫の金額・原価率", () => {
  assert.equal(unitCostOf({ qty: 2, amount: 9600 }, 24), 200); // 1本200円
  assert.equal(stockValue([{ qty: 10, unit_cost: 200 }, { qty: 2.5, unit_cost: 1000 }]), 4500);
  assert.deepEqual(costOf({ openingValue: 50_000, purchases: 300_000, stockNow: 70_000, sales: 1_000_000 }), { cost: 280_000, rate: 0.28 });
  assert.equal(costOf({ openingValue: 0, purchases: 0, stockNow: 0, sales: 0 }).rate, null);
});
