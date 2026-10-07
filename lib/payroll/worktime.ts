// 勤怠 → 給与の労働時間の計算。ルールは docs/payroll-rules.md（2026-10-08 決定）
// テストから Node で直接読むため、ここでは他のファイルを import しない。時刻はすべてエポックミリ秒で扱う
//
//   丸め      … 15分単位。出勤は切り上げ、退勤は切り捨て
//   早出      … シフト開始時刻から数える
//   休憩      … 本人が入力した実績を引く（深夜と日中に按分）
//   深夜      … 22:00〜翌5:00（JST）
//   残業      … weekly_variable（1週間単位の非定型的変形）：その日のシフトの時間（8時間以下なら8時間、上限10時間）を超えた分
//                statutory（法定）：1日8時間を超えた分
//                どちらも、日ごとの残業を除いた週（月〜日）の合計が40時間を超えた分を、週の後ろの日から残業にする
//   休日出勤  … 週に1日も休みがない（7日とも勤務した）ときだけ、最後の日を法定休日の勤務とする。その日は残業に数えない

const MIN = 60_000;
const DAY = 86_400_000;
const JST = 9 * 3_600_000;
const UNIT = 15 * MIN;

export type OvertimeRule = "weekly_variable" | "statutory";

export type DayInput = {
  date: string; // 営業日（JST 'YYYY-MM-DD'）
  rule: OvertimeRule;
  checkin: string | null;
  checkout: string | null;
  breakMinutes: number;
  shift: { start: string; end: string } | null; // 出勤のシフト（'HH:MM'）。休み・未設定なら null
};

export type DayResult = {
  date: string;
  open: boolean; // 退勤がない（計算できない）
  worked: number; // 実働（分）
  night: number;
  overtime: number;
  holiday: number; // 法定休日の勤務（分）
  late: number; // 遅刻（分）
  earlyLeave: number; // 早退（分）
};

export const ceilUnit = (ms: number) => Math.ceil(ms / UNIT) * UNIT;
export const floorUnit = (ms: number) => Math.floor(ms / UNIT) * UNIT;
const jstAt = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm.slice(0, 5)}:00+09:00`);
const jstYmd = (ms: number) => new Date(ms + JST).toISOString().slice(0, 10);
const minutes = (ms: number) => Math.max(0, Math.round(ms / MIN));

/** 労基法34条の休憩の最低限（6時間超45分・8時間超60分） */
export function requiredBreak(workedMinutes: number) {
  if (workedMinutes > 480) return 60;
  if (workedMinutes > 360) return 45;
  return 0;
}

/** [start, end) のうち深夜（22:00〜翌5:00 JST）に当たるミリ秒 */
export function nightMs(start: number, end: number) {
  let total = 0;
  for (let t = start - DAY; t <= end + DAY; t += DAY) {
    const midnight = Date.parse(`${jstYmd(t)}T00:00:00+09:00`);
    const s = midnight + 22 * 3_600_000;
    const e = midnight + DAY + 5 * 3_600_000;
    total += Math.max(0, Math.min(end, e) - Math.max(start, s));
  }
  return Math.min(total, end - start);
}

/** その日の所定の上限（分）。これを超えた分が日ごとの残業 */
function dailyThreshold(d: DayInput, shiftMinutes: number | null) {
  if (d.rule !== "weekly_variable" || shiftMinutes === null) return 480;
  // 1週間単位の非定型：知らせた労働時間（シフトの長さから法定の休憩を引いたもの）。8時間以下なら8時間、上限10時間
  const notified = shiftMinutes - requiredBreak(shiftMinutes);
  return Math.max(480, Math.min(notified, 600));
}

/** 1日分。週の残業・休日出勤は workWeek で後から足す */
export function workDay(d: DayInput): DayResult & { dailyOvertime: number } {
  const empty = { date: d.date, open: false, worked: 0, night: 0, overtime: 0, dailyOvertime: 0, holiday: 0, late: 0, earlyLeave: 0 };
  if (!d.checkin) return empty;
  if (!d.checkout) return { ...empty, open: true };
  const inMs = Date.parse(d.checkin);
  const outMs = Date.parse(d.checkout);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs <= inMs) return { ...empty, open: true };

  let shiftStart: number | null = null;
  let shiftEnd: number | null = null;
  if (d.shift) {
    shiftStart = jstAt(d.date, d.shift.start);
    shiftEnd = jstAt(d.date, d.shift.end);
    if (shiftEnd <= shiftStart) shiftEnd += DAY; // 19:30〜00:30 のように日をまたぐ
  }

  const inUnit = ceilUnit(inMs);
  const payStart = shiftStart !== null ? Math.max(shiftStart, inUnit) : inUnit;
  const payEnd = floorUnit(outMs);
  if (payEnd <= payStart) return empty;

  const gross = minutes(payEnd - payStart);
  const brk = Math.min(Math.max(d.breakMinutes, 0), gross);
  const worked = gross - brk;
  // 休憩を深夜・日中のどちらで取ったかの記録はないので、実働に按分する
  const night = gross > 0 ? Math.round((minutes(nightMs(payStart, payEnd)) / gross) * worked) : 0;
  const shiftMinutes = shiftStart !== null && shiftEnd !== null ? minutes(shiftEnd - shiftStart) : null;
  const dailyOvertime = Math.max(0, worked - dailyThreshold(d, shiftMinutes));

  return {
    date: d.date,
    open: false,
    worked,
    night: Math.min(night, worked),
    overtime: dailyOvertime,
    dailyOvertime,
    holiday: 0,
    late: shiftStart !== null ? minutes(payStart - shiftStart) : 0,
    earlyLeave: shiftEnd !== null ? minutes(shiftEnd - payEnd) : 0,
  };
}

/** 1週間（月〜日）分。週40時間を超えた分と、休日出勤を決める */
export function workWeek(days: DayInput[]): DayResult[] {
  const results = days.map(workDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  const workedDays = results.filter((r) => r.worked > 0 || r.open);

  // 7日とも勤務した週だけ、最後の日を法定休日の勤務にする（残業には数えない）
  if (new Set(workedDays.map((r) => r.date)).size === 7) {
    const last = workedDays[workedDays.length - 1];
    last.holiday = last.worked;
    last.overtime = 0;
    last.dailyOvertime = 0;
  }

  const regular = results.filter((r) => r.holiday === 0);
  let weekly = Math.max(0, regular.reduce((s, r) => s + (r.worked - r.dailyOvertime), 0) - 2400);
  for (let i = regular.length - 1; i >= 0 && weekly > 0; i--) {
    const r = regular[i];
    const room = r.worked - r.dailyOvertime - (r.overtime - r.dailyOvertime);
    const add = Math.min(room, weekly);
    r.overtime += add;
    weekly -= add;
  }
  return results.map((r) => ({
    date: r.date,
    open: r.open,
    worked: r.worked,
    night: r.night,
    overtime: r.overtime,
    holiday: r.holiday,
    late: r.late,
    earlyLeave: r.earlyLeave,
  }));
}

const mondayOf = (ymd: string) => {
  const ms = Date.parse(`${ymd}T12:00:00Z`);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
};

export type MonthSummary = {
  workDays: number;
  workMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  lateCount: number;
  lateMinutes: number;
  earlyLeaveCount: number;
  earlyLeaveMinutes: number;
  openDays: string[];
  days: DayResult[];
};

/**
 * 1人・1か月分。週をまたぐ残業を正しく数えるため、days には月の最初の週の月曜〜月末を渡す。
 * 集計に入れるのは [from, to] の日だけ
 */
export function workMonth(days: DayInput[], from: string, to: string): MonthSummary {
  const weeks = new Map<string, DayInput[]>();
  for (const d of days) weeks.set(mondayOf(d.date), [...(weeks.get(mondayOf(d.date)) ?? []), d]);
  const all = [...weeks.values()].flatMap(workWeek).filter((r) => r.date >= from && r.date <= to);
  const sum = (k: keyof DayResult) => all.reduce((s, r) => s + (r[k] as number), 0);
  return {
    workDays: all.filter((r) => r.worked > 0).length,
    workMinutes: sum("worked"),
    overtimeMinutes: sum("overtime"),
    nightMinutes: sum("night"),
    holidayMinutes: sum("holiday"),
    lateCount: all.filter((r) => r.late > 0).length,
    lateMinutes: sum("late"),
    earlyLeaveCount: all.filter((r) => r.earlyLeave > 0).length,
    earlyLeaveMinutes: sum("earlyLeave"),
    openDays: all.filter((r) => r.open).map((r) => r.date),
    days: all,
  };
}

export type PayType = "monthly" | "daily" | "hourly" | "contract";

/** 割増の時間単価。月給÷173時間、日給÷8時間、時給はそのまま */
export function hourlyUnit(type: PayType, amount: number) {
  if (type === "monthly") return amount / 173;
  if (type === "daily") return amount / 8;
  if (type === "hourly") return amount;
  return 0;
}

export const PAID_LEAVE_HOURS = 5; // 時給の人の有給1日分（一律5時間）

/**
 * 割増などの金額（円、月の合計で一度だけ丸める）。
 *   時給 … 基本給は「時給×実働」に含まれるので、残業・深夜は0.25、休日は0.35を上乗せ
 *   月給・日給 … 基本給に残業・休日の時間は含まれないので、残業は1.25、休日は1.35、深夜は0.25
 */
export function premiumPay(type: PayType, amount: number, s: Pick<MonthSummary, "overtimeMinutes" | "nightMinutes" | "holidayMinutes">, paidLeaveDays = 0) {
  const unit = hourlyUnit(type, amount);
  const h = (m: number) => m / 60;
  const base = type === "hourly" ? 0 : 1;
  return {
    overtimePay: Math.round(h(s.overtimeMinutes) * unit * (base + 0.25)),
    nightPay: Math.round(h(s.nightMinutes) * unit * 0.25),
    holidayPay: Math.round(h(s.holidayMinutes) * unit * (base + 0.35)),
    paidLeavePay: type === "hourly" ? Math.round(paidLeaveDays * PAID_LEAVE_HOURS * unit) : 0,
  };
}
