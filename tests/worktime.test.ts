import { test } from "node:test";
import assert from "node:assert/strict";
import { nightMs, premiumPay, workDay, workMonth, workWeek, type DayInput } from "../lib/payroll/worktime.ts";

// JST の 'YYYY-MM-DD HH:MM' → ISO
const t = (s: string) => new Date(`${s.replace(" ", "T")}:00+09:00`).toISOString();
const day = (date: string, inT: string | null, outT: string | null, o: Partial<DayInput> = {}): DayInput => ({
  date,
  rule: "statutory",
  checkin: inT ? t(inT) : null,
  checkout: outT ? t(outT) : null,
  breakMinutes: 0,
  shift: null,
  ...o,
});

test("丸め — 出勤は15分切り上げ、退勤は15分切り捨て（シフトなし）", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 19:16", "2026-11-03 00:54"));
  assert.equal(r.worked, 315); // 19:30〜00:45
});

test("早出 — シフト開始より前に来てもシフト開始から数える", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 19:05", "2026-11-03 00:30", { shift: { start: "19:30", end: "00:30" } }));
  assert.equal(r.worked, 300);
  assert.equal(r.late, 0);
});

test("遅刻・早退 — 15分単位で数える", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 19:40", "2026-11-03 00:20", { shift: { start: "19:30", end: "00:30" } }));
  assert.equal(r.late, 15); // 19:45 開始
  assert.equal(r.earlyLeave, 15); // 00:15 終了
  assert.equal(r.worked, 270);
});

test("延長 — シフト終了後も打刻どおり（切り捨て後）払う", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 19:30", "2026-11-03 01:10", { shift: { start: "19:30", end: "00:30" } }));
  assert.equal(r.worked, 330); // 01:00 まで
});

test("深夜 — 22時〜翌5時。休憩は按分して引く", () => {
  assert.equal(nightMs(Date.parse(t("2026-11-02 22:00")), Date.parse(t("2026-11-03 02:00"))) / 60000, 240);
  const r = workDay(day("2026-11-02", "2026-11-02 20:00", "2026-11-03 02:00", { breakMinutes: 60 }));
  assert.equal(r.worked, 300);
  assert.equal(r.night, 200); // 深夜240/全体360 × 実働300
});

test("残業（法定） — 1日8時間を超えた分", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 10:00", "2026-11-02 20:00", { breakMinutes: 60 }));
  assert.equal(r.worked, 540);
  assert.equal(r.overtime, 60);
});

test("残業（1週間単位の変形） — 知らせた9時間のシフト内なら残業にならない", () => {
  // シフト 14:00〜24:00（10時間、法定の休憩60分を引いて9時間）
  const base = { rule: "weekly_variable" as const, shift: { start: "14:00", end: "00:00" }, breakMinutes: 60 };
  assert.equal(workDay(day("2026-11-02", "2026-11-02 14:00", "2026-11-03 00:00", base)).overtime, 0);
  // 同じシフトで1時間延長 → その1時間だけ残業
  assert.equal(workDay(day("2026-11-02", "2026-11-02 14:00", "2026-11-03 01:00", base)).overtime, 60);
});

test("残業（1週間単位の変形） — 8時間以下のシフトは8時間まで残業にならない", () => {
  const r = workDay(
    day("2026-11-02", "2026-11-02 19:30", "2026-11-03 03:00", { rule: "weekly_variable", shift: { start: "19:30", end: "00:30" } }),
  );
  assert.equal(r.worked, 450);
  assert.equal(r.overtime, 0);
});

test("週40時間 — 日ごとの残業を除いて40時間を超えた分を、週の後ろの日から残業にする", () => {
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) => day(d, `${d} 10:00`, `${d} 17:00`));
  const r = workWeek(week); // 7時間×6日＝42時間
  assert.equal(r.reduce((s, x) => s + x.overtime, 0), 120);
  assert.equal(r[5].overtime, 120); // 土曜に寄せる
});

test("休日出勤 — 7日とも勤務した週は最後の日を休日にし、残業に数えない", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
  const r = workWeek(dates.map((d) => day(d, `${d} 19:00`, `${d} 23:00`)));
  assert.equal(r[6].holiday, 240);
  assert.equal(r[6].overtime, 0);
  assert.equal(r.reduce((s, x) => s + x.overtime, 0), 0); // 4時間×6日＝24時間
});

test("6日勤務の週は休日出勤にならない", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  assert.equal(workWeek(dates.map((d) => day(d, `${d} 19:00`, `${d} 23:00`))).every((x) => x.holiday === 0), true);
});

test("未退勤 — 計算せずに印を付ける", () => {
  const r = workDay(day("2026-11-02", "2026-11-02 19:00", null));
  assert.equal(r.open, true);
  assert.equal(r.worked, 0);
});

test("月の集計 — 範囲外の日は入れない（週の計算には使う）", () => {
  const days = ["2026-10-26", "2026-10-31", "2026-11-01", "2026-11-02"].map((d) => day(d, `${d} 19:00`, `${d} 23:00`));
  const s = workMonth(days, "2026-11-01", "2026-11-30");
  assert.equal(s.workDays, 2);
  assert.equal(s.workMinutes, 480);
});

test("割増の金額 — 時給は上乗せ分、月給は1.25倍", () => {
  const s = { overtimeMinutes: 120, nightMinutes: 240, holidayMinutes: 60 };
  assert.deepEqual(premiumPay("hourly", 1200, s, 2), { overtimePay: 600, nightPay: 1200, holidayPay: 420, paidLeavePay: 12000 });
  const m = premiumPay("monthly", 250000, s);
  assert.equal(m.overtimePay, Math.round(2 * (250000 / 173) * 1.25)); // 3613
  assert.equal(m.holidayPay, Math.round(1 * (250000 / 173) * 1.35));
  assert.equal(premiumPay("daily", 10000, { overtimeMinutes: 60, nightMinutes: 0, holidayMinutes: 0 }).overtimePay, 1563);
});
