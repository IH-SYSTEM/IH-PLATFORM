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

import { formatMinutes, monthRange, toJSTTimeLabel, workedMinutes } from "../lib/business-day.ts";

test("時刻ラベル — 日をまたぐ退勤には「翌」を付ける", () => {
  assert.equal(toJSTTimeLabel("2026-08-31T10:30:00Z", "2026-08-31"), "19:30");
  assert.equal(toJSTTimeLabel("2026-08-31T15:30:00Z", "2026-08-31"), "翌00:30");
  assert.equal(toJSTTimeLabel("2026-09-02T15:30:00Z", "2026-08-31"), "9/3 00:30");
  assert.equal(toJSTTimeLabel(null, "2026-08-31"), "—");
});

test("実働 — 日をまたいでも休憩を引いて出す", () => {
  assert.equal(workedMinutes("2026-08-31T10:30:00Z", "2026-08-31T15:30:00Z", 30), 270);
  assert.equal(workedMinutes("2026-08-31T10:30:00Z", null), null);
  assert.equal(workedMinutes("2026-08-31T15:30:00Z", "2026-08-31T10:30:00Z"), null);
  assert.equal(formatMinutes(270), "4時間30分");
  assert.equal(formatMinutes(null), "—");
});

test("月の範囲 — うるう年の2月と年末", () => {
  assert.deepEqual(monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
});

import { jstCheckoutToISO, jstDateTimeToISO } from "../lib/business-day.ts";

test("JST の日時 → UTC", () => {
  assert.equal(jstDateTimeToISO("2026-08-31", "19:30"), "2026-08-31T10:30:00.000Z");
});

test("退勤 — 出勤より前の時刻は翌日として扱う", () => {
  const checkin = jstDateTimeToISO("2026-08-31", "19:30");
  assert.equal(jstCheckoutToISO("2026-08-31", "00:30", checkin), "2026-08-31T15:30:00.000Z"); // 9/1 00:30 JST
  assert.equal(jstCheckoutToISO("2026-08-31", "23:00", checkin), "2026-08-31T14:00:00.000Z");
  assert.equal(jstCheckoutToISO("2026-08-31", "00:30", null), "2026-08-30T15:30:00.000Z");
});

test("退勤 — 何度通しても同じ結果（保存し直しで1日ずれない）", () => {
  const checkin = jstDateTimeToISO("2026-08-31", "19:30");
  const once = jstCheckoutToISO("2026-08-31", "00:30", checkin);
  const twice = jstCheckoutToISO("2026-08-31", toJSTTimeString(once), checkin);
  assert.equal(twice, once);
});
