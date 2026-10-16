import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementYearStart, fixedOvertimePremiums, overtimeLevels } from "../lib/payroll/fixed-overtime.ts";

const H = 60;

test("30時間以内なら時間外手当は0（固定残業手当で足りる）", () => {
  // 基本給 300,000円 → 単価 (300,000−45,000)/173 ≒ 1,474円。30時間 × 1.25 ≒ 55,267円 > 45,000円 → 不足分を払う
  const p = fixedOvertimePremiums(300_000, { overtime: 30 * H, night: 0, holiday: 0 });
  assert.equal(p.fixed, 45_000);
  assert.equal(p.overtimePay, Math.round(30 * (255_000 / 173) * 1.25 - 45_000));
  // 基本給 220,000円 → 単価 ≒ 1,012円。30時間で 37,933円 < 45,000円 → 0
  assert.equal(fixedOvertimePremiums(220_000, { overtime: 30 * H, night: 0, holiday: 0 }).overtimePay, 0);
});

test("30時間を超えた分は払う", () => {
  const unit = (220_000 - 45_000) / 173;
  assert.equal(fixedOvertimePremiums(220_000, { overtime: 40 * H, night: 0, holiday: 0 }).overtimePay, Math.round(10 * unit * 1.25));
});

test("深夜・休日は固定残業手当を除いた単価で別に払う", () => {
  const unit = (220_000 - 45_000) / 173;
  const p = fixedOvertimePremiums(220_000, { overtime: 0, night: 10 * H, holiday: 8 * H });
  assert.equal(p.nightPay, Math.round(10 * unit * 0.25));
  assert.equal(p.holidayPay, Math.round(8 * unit * 1.35));
});

test("36協定の段階と年度", () => {
  assert.deepEqual(overtimeLevels(36 * H, 0).map((x) => x.key), ["m36"]);
  assert.deepEqual(overtimeLevels(45 * H, 360 * H).map((x) => x.key), ["m45", "y360"]);
  assert.deepEqual(overtimeLevels(10 * H, 0), []);
  assert.equal(agreementYearStart("2026-10-16"), "2026-04-01");
  assert.equal(agreementYearStart("2027-02-01"), "2026-04-01");
});
