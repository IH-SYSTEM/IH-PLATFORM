/**
 * 1日の人件費（売上画面の人件費率に使う。給与明細の計算とは別の「見込み」）。
 *   時給・日給 … その日の勤務（実働・残業・深夜・休日）から、その日の金額で計算
 *   アルバイト（時給・日給）… その日の勤怠×その日の金額（＋残業・深夜の割増）。実際に働いた分だけ
 *   正社員（月給）… 月給＋固定の手当＋会社負担の法定福利費を、その店のその月の営業日数で割り、営業日ごとに所属店へ
 *   （2026-10-09 黒田さん決定）
 */
import { premiumPay, type DayResult, type PayType } from "./worktime.ts";

/** 勤務した日にかかる分（時給・日給の本体と、全員の割増） */
export function dayWorkCost(type: PayType, amount: number, d: Pick<DayResult, "worked" | "overtime" | "night" | "holiday">) {
  if (type === "contract" || !amount) return 0;
  const p = premiumPay(type, amount, { overtimeMinutes: d.overtime, nightMinutes: d.night, holidayMinutes: d.holiday });
  const premiums = p.overtimePay + p.nightPay + p.holidayPay;
  if (type === "hourly") return Math.round((d.worked / 60) * amount) + premiums;
  if (type === "daily") return (d.worked > 0 ? amount : 0) + premiums;
  return premiums; // 月給の残業・深夜・休日
}

/** 営業日を推定する（今月のように途中の月は、ここまでの営業日の割合から月全体を見込む） */
export function businessDaysInMonth(salesDays: number, elapsedDays: number, daysInMonth: number) {
  if (!salesDays) return daysInMonth; // 売上のない店（本部など）は暦日
  if (elapsedDays >= daysInMonth) return salesDays;
  return Math.max(salesDays, Math.round((salesDays / elapsedDays) * daysInMonth));
}
