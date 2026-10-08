import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDaysInMonth, dayWorkCost } from "../lib/payroll/labor-day.ts";

test("時給：実働×時給＋深夜0.25", () => {
  // 6時間・うち深夜1時間・時給1,100円 → 6,600 + 275
  assert.equal(dayWorkCost("hourly", 1100, { worked: 360, overtime: 0, night: 60, holiday: 0 }), 6875);
});

test("月給：勤務日は割増だけ（月額は営業日で割って別に配る）", () => {
  // 月給173,000円 → 時間単価1,000円。残業1時間（×1.25）＋深夜1時間（×0.25）
  assert.equal(dayWorkCost("monthly", 173000, { worked: 540, overtime: 60, night: 60, holiday: 0 }), 1500);
});

test("営業日数：終わった月はそのまま、途中の月は見込み、売上のない店は暦日", () => {
  assert.equal(businessDaysInMonth(26, 31, 31), 26);
  assert.equal(businessDaysInMonth(6, 8, 31), 23); // 8日で6日営業 → 31日なら約23日
  assert.equal(businessDaysInMonth(0, 8, 31), 31);
});

test("日給：勤務した日だけ日給", () => {
  assert.equal(dayWorkCost("daily", 10000, { worked: 480, overtime: 0, night: 0, holiday: 0 }), 10000);
  assert.equal(dayWorkCost("daily", 10000, { worked: 0, overtime: 0, night: 0, holiday: 0 }), 0);
});
