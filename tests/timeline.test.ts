import { test } from "node:test";
import assert from "node:assert/strict";
import { axisRange, barPos, headcount, hourTicks, span, toMin } from "../lib/timeline.ts";

test("時刻を分に", () => {
  assert.equal(toMin("09:30:00"), 570);
  assert.equal(toMin(null), null);
});

test("日をまたぐシフトは +24時間", () => {
  assert.deepEqual(span("18:00", "02:00"), [1080, 1560]);
  assert.deepEqual(span("10:00", "15:00"), [600, 900]);
});

test("表の幅は開店〜閉店、はみ出すシフトで広がる", () => {
  assert.deepEqual(axisRange("11:00:00", "22:00:00", []), [660, 1320]);
  assert.deepEqual(axisRange("11:00:00", "22:00:00", [[570, 900], [1080, 1410]]), [540, 1440]);
  assert.deepEqual(axisRange(null, null, []), [540, 1320]);
  assert.deepEqual(axisRange(null, null, [[615, 905]]), [600, 960]);
});

test("バーの位置", () => {
  assert.deepEqual(barPos([600, 900], [600, 1200]), { left: 0, width: 50 });
  const p = barPos([500, 700], [600, 1200]);
  assert.equal(p.left, 0);
  assert.ok(Math.abs(p.width - 100 / 6) < 1e-9);
});

test("1時間ごとの人数", () => {
  const s: [number, number][] = [[600, 900], [720, 1080]];
  assert.equal(hourTicks([600, 1080]).length, 8);
  assert.equal(headcount(s, 600), 1);
  assert.equal(headcount(s, 780), 2);
  assert.equal(headcount(s, 900), 1);
});
