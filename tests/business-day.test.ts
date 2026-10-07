import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDayJST, toJSTDateString, toJSTTimeString } from "../lib/business-day.ts";

// 実行: node --experimental-strip-types --test tests/*.test.ts

test("JST の日付 — UTC 15:00 は JST の翌日 0:00", () => {
  assert.equal(toJSTDateString(new Date("2026-10-07T14:59:00Z")), "2026-10-07");
  assert.equal(toJSTDateString(new Date("2026-10-07T15:00:00Z")), "2026-10-08");
});

test("営業日 — 夜の出勤はその日", () => {
  assert.equal(businessDayJST(new Date("2026-10-07T10:30:00Z")), "2026-10-07"); // JST 19:30
});

test("営業日 — 深夜2時の退勤は前日の営業日", () => {
  assert.equal(businessDayJST(new Date("2026-10-07T17:00:00Z")), "2026-10-07"); // JST 10/8 2:00
});

test("営業日 — 朝5時ちょうどで切り替わる", () => {
  assert.equal(businessDayJST(new Date("2026-10-07T19:59:00Z")), "2026-10-07"); // JST 10/8 4:59
  assert.equal(businessDayJST(new Date("2026-10-07T20:00:00Z")), "2026-10-08"); // JST 10/8 5:00
});

test("営業日 — 月末・年末をまたぐ", () => {
  assert.equal(businessDayJST(new Date("2026-10-31T18:00:00Z")), "2026-10-31"); // JST 11/1 3:00
  assert.equal(businessDayJST(new Date("2026-12-31T17:30:00Z")), "2026-12-31"); // JST 1/1 2:30
});

test("JST の時刻表示", () => {
  assert.equal(toJSTTimeString("2026-10-07T10:30:00Z"), "19:30");
  assert.equal(toJSTTimeString("2026-10-07T15:30:00Z"), "00:30");
  assert.equal(toJSTTimeString(null), "—");
  assert.equal(toJSTTimeString("broken"), "—");
});
