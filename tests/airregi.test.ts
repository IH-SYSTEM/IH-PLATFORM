import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDateOf, parseAirRegi } from "../lib/pos/airregi.ts";
import { parseCsv } from "../lib/pos/csv.ts";

const HEADER =
  "取引No,来店日,来店時間,会計日,会計時間,合計,小計,内消費税,修正金額合計,修正後合計,修正後内消費税,現金,クレジットカード(Airペイ),楽天,PayPay,おつり,割引/割増合計(税込),人数,商品点数,伝票名,レジ担当者名,カテゴリー名,メニュー名,価格,注文数量,個別割引/割増合計額";

test("CSV: 引用符・カンマ・改行・エスケープ", () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n"f\ng",h\n'), [
    ["a", "b,c", 'd"e'],
    ["f\ng", "h"],
  ]);
});

test("営業日は 6:00 区切り", () => {
  assert.equal(businessDateOf("2026/10/01", "23:59:00"), "2026-10-01");
  assert.equal(businessDateOf("2026/10/02", "01:30:00"), "2026-10-01");
  assert.equal(businessDateOf("2026/10/02", "06:00:00"), "2026-10-02");
  assert.equal(businessDateOf("2026/11/01", "02:00:00"), "2026-10-31");
});

test("会計の先頭行と注文の行をまとめる", () => {
  const csv = [
    HEADER,
    'A1,2026/10/01,17:20:45,2026/10/01,19:27:08,9000,9000,818,0,9000,818,10000,0,0,0,1000,0,2,6,"11","黒田","コース（飲物）","飲み放題",2000,2,0',
    'A1,,,,,,,,,,,,,,,,,,,,,"飲み放題","F生ビール",0,2,0',
    'A2,2026/10/02,23:00:00,2026/10/03,00:40:00,5000,5000,454,-500,4500,409,0,0,0,4500,0,-500,1,3,"",""," お通し","お通し",500,1,0',
  ].join("\r\n");
  const { receipts, error } = parseAirRegi(csv);
  assert.equal(error, undefined);
  assert.equal(receipts.length, 2);
  assert.deepEqual(
    { no: receipts[0].receiptNo, day: receipts[0].businessDate, total: receipts[0].total, people: receipts[0].people, pay: receipts[0].payments, lines: receipts[0].lines.length },
    { no: "A1", day: "2026-10-01", total: 9000, people: 2, pay: { 現金: 9000 }, lines: 2 },
  );
  assert.equal(receipts[1].businessDate, "2026-10-02"); // 深夜0:40の会計は前日の営業日
  assert.equal(receipts[1].total, 4500); // 修正後合計
  assert.deepEqual(receipts[1].payments, { PayPay: 4500 });
  assert.equal(receipts[1].checkoutAt, "2026-10-03T00:40:00+09:00");
});

test("ほかのCSVは断る", () => {
  assert.match(parseAirRegi("日付,売上\n2026/10/01,1000\n").error ?? "", /会計明細/);
});
