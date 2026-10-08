import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPeriod } from "../lib/routine-period.ts";

const weekly = { every: "week" as const, weekday: 1, day: null, grace_days: 1 };
const monthly = { every: "month" as const, weekday: null, day: 1, grace_days: 2 };

test("毎週月曜：その週の月曜から、期限は火曜", () => {
  assert.deepEqual(currentPeriod(weekly, "2026-10-12"), { start: "2026-10-12", due: "2026-10-13" }); // 月
  assert.deepEqual(currentPeriod(weekly, "2026-10-09"), { start: "2026-10-05", due: "2026-10-06" }); // 金
  assert.deepEqual(currentPeriod(weekly, "2026-10-11"), { start: "2026-10-05", due: "2026-10-06" }); // 日
});

test("毎月1日：期限は3日、月をまたぐ", () => {
  assert.deepEqual(currentPeriod(monthly, "2026-10-09"), { start: "2026-10-01", due: "2026-10-03" });
  assert.deepEqual(currentPeriod({ ...monthly, day: 25 }, "2026-10-09"), { start: "2026-09-25", due: "2026-09-27" });
  assert.deepEqual(currentPeriod({ ...monthly, day: 25 }, "2026-01-05"), { start: "2025-12-25", due: "2025-12-27" });
});
