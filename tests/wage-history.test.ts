import { test } from "node:test";
import assert from "node:assert/strict";
import { dayBefore, daysBetween, segments, wageOn } from "../lib/payroll/wage-history.ts";

const rows = [
  { valid_from: "2026-06-01", valid_to: "2026-09-10", employment_type: "hourly", amount: 1100 },
  { valid_from: "2026-09-11", valid_to: null, employment_type: "hourly", amount: 1200 },
];

test("その日の時給", () => {
  assert.equal(wageOn(rows, "2026-09-10")?.amount, 1100);
  assert.equal(wageOn(rows, "2026-09-11")?.amount, 1200);
  assert.equal(wageOn(rows, "2027-01-01")?.amount, 1200);
  assert.equal(wageOn(rows, "2026-05-31"), null);
});

test("月の途中で変わった月は2つに分ける", () => {
  assert.deepEqual(
    segments(rows, "2026-09-01", "2026-09-30").map((s) => [s.from, s.to, s.row.amount]),
    [
      ["2026-09-01", "2026-09-10", 1100],
      ["2026-09-11", "2026-09-30", 1200],
    ],
  );
  assert.deepEqual(segments(rows, "2026-10-01", "2026-10-31").map((s) => s.row.amount), [1200]);
  assert.deepEqual(segments(rows, "2026-06-01", "2026-06-30").map((s) => [s.from, s.to]), [["2026-06-01", "2026-06-30"]]);
});

test("日数と前日", () => {
  assert.equal(daysBetween("2026-09-01", "2026-09-10"), 10);
  assert.equal(dayBefore("2026-09-11"), "2026-09-10");
  assert.equal(dayBefore("2026-10-01"), "2026-09-30");
});
