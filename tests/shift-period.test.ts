import { test } from "node:test";
import assert from "node:assert/strict";
import { canCallUrgent, crossesMidnight, isPast, mondayOf, monthDeadlines, openMonths, openWeeks, partTimeWeeks, periodTypeFor, weekDeadlines } from "../lib/shift-period.ts";

test("週の月曜 — 日曜は前の月曜に戻る", () => {
  assert.equal(mondayOf("2026-11-02"), "2026-11-02"); // 月
  assert.equal(mondayOf("2026-11-08"), "2026-11-02"); // 日
  assert.equal(mondayOf("2027-01-01"), "2026-12-28"); // 年をまたぐ
});

test("週の締切 — 提出は8日前の日曜、確定は5日前の水曜", () => {
  assert.deepEqual(weekDeadlines("2026-11-02"), { submit: "2026-10-25", decide: "2026-10-28" });
});

test("月の締切 — 前月15日に提出、前月20日に確定。1月分は前年12月", () => {
  assert.deepEqual(monthDeadlines("2026-11"), { submit: "2026-10-15", decide: "2026-10-20" });
  assert.deepEqual(monthDeadlines("2027-01"), { submit: "2026-12-15", decide: "2026-12-20" });
});

test("出せる週 — 提出期限の当日まではその週、翌日から次の週", () => {
  assert.equal(openWeeks("2026-10-25")[0].start, "2026-11-02");
  assert.equal(openWeeks("2026-10-26")[0].start, "2026-11-09");
  assert.equal(openWeeks("2026-10-08").length, 4);
});

test("出せる月 — 15日までは翌月、16日からは翌々月", () => {
  assert.equal(openMonths("2026-10-15")[0].start, "2026-11-01");
  assert.equal(openMonths("2026-10-16")[0].start, "2026-12-01");
  assert.equal(openMonths("2026-12-20")[0].start, "2027-02-01");
});

test("締切 — 当日はまだ出せる", () => {
  assert.equal(isPast("2026-10-15", "2026-10-15"), false);
  assert.equal(isPast("2026-10-15", "2026-10-16"), true);
});

test("雇用区分 — 社員は月、アルバイトは週、役員・業務委託は対象外", () => {
  assert.equal(periodTypeFor("fulltime"), "month");
  assert.equal(periodTypeFor("contract"), "month");
  assert.equal(periodTypeFor("parttime"), "week");
  assert.equal(periodTypeFor("officer"), null);
  assert.equal(periodTypeFor("freelance"), null);
});

test("日をまたぐシフト", () => {
  assert.equal(crossesMidnight("19:30", "00:30"), true);
  assert.equal(crossesMidnight("10:00", "19:00"), false);
});

test("アルバイトの希望 — まだ始まっていない週から4週。日曜は翌週から", () => {
  const w = partTimeWeeks("2026-10-08"); // 木
  assert.deepEqual(w.map((x) => x.start), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  assert.equal(w[0].submit, "2026-10-11"); // 前日の日曜まで
  assert.equal(w[0].decide, "2026-10-07"); // 確定は前週の水曜
  assert.equal(partTimeWeeks("2026-10-11")[0].start, "2026-10-12"); // 日曜 → 翌日の月曜からの週
  assert.equal(partTimeWeeks("2026-10-12")[0].start, "2026-10-19"); // 月曜 → その週はもう始まっている
});

test("急募 — 今日から3日後まで", () => {
  assert.equal(canCallUrgent("2026-10-08", "2026-10-08"), true);
  assert.equal(canCallUrgent("2026-10-11", "2026-10-08"), true);
  assert.equal(canCallUrgent("2026-10-12", "2026-10-08"), false);
  assert.equal(canCallUrgent("2026-10-07", "2026-10-08"), false);
});
