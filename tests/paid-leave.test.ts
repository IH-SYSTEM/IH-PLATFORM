import { test } from "node:test";
import assert from "node:assert/strict";
import { paidLeaveBalance, requestDeadline, spanDays, statutoryGrants } from "../lib/paid-leave-calc.ts";

test("付与 — 入社日から法律どおり（半年10日→1年半11日→…→6年半以降20日）", () => {
  const g = statutoryGrants("2020-04-01", "2027-12-31");
  assert.deepEqual(
    g.map((x) => [x.date, x.days]),
    [
      ["2020-10-01", 10],
      ["2021-10-01", 11],
      ["2022-10-01", 12],
      ["2023-10-01", 14],
      ["2024-10-01", 16],
      ["2025-10-01", 18],
      ["2026-10-01", 20],
      ["2027-10-01", 20],
    ],
  );
  assert.equal(g[0].expires, "2022-10-01"); // 2年で時効
});

test("残り — 時効と、古い付与から使う", () => {
  // 2024-10-01 に10日、2025-10-01 に11日。2025-03 に3日使った
  const b = paidLeaveBalance({ hireDate: "2024-04-01", today: "2026-01-10", used: ["2025-03-03", "2025-03-04", "2025-03-05"] });
  assert.equal(b.remaining, 7 + 11);
  assert.deepEqual(b.nextGrant, { date: "2026-10-01", days: 12 });
  // 2026-10-02 には最初の付与（残り7日）が時効
  assert.equal(paidLeaveBalance({ hireDate: "2024-04-01", today: "2026-10-02", used: ["2025-03-03", "2025-03-04", "2025-03-05"] }).remaining, 11 + 12);
});

test("はじめの残高 — それより前は数えず、その残りから始める", () => {
  const b = paidLeaveBalance({ hireDate: "2018-04-01", today: "2026-11-01", used: ["2026-10-05", "2026-10-20"], baseline: { asOf: "2026-09-30", remaining: 25 } });
  // 25（はじめ）＋ 2026-10-01 の20日 − 2日
  assert.equal(b.remaining, 43);
});

test("年5日 — 10日以上の付与から1年のあいだの取得", () => {
  const b = paidLeaveBalance({ hireDate: "2024-04-01", today: "2026-01-10", used: ["2025-03-03", "2025-11-01", "2025-12-24"] });
  assert.deepEqual(b.obligation, { from: "2025-10-01", to: "2026-09-30", used: 2, need: 5 });
});

test("申請の期限 — 1日は2週間前、2〜4日は1か月前、5日以上は2か月前", () => {
  assert.equal(requestDeadline("2026-12-15", 1), "2026-12-01");
  assert.equal(requestDeadline("2026-12-15", 3), "2026-11-15");
  assert.equal(requestDeadline("2026-12-15", 5), "2026-10-15");
  assert.equal(spanDays("2026-12-15", "2026-12-19"), 5);
});
