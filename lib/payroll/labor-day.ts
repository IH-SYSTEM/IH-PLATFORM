/**
 * 1日の人件費（売上画面の人件費率に使う。給与明細の計算とは別の「見込み」）。
 *   時給・日給 … その日の勤務（実働・残業・深夜・休日）から、その日の金額で計算
 *   月給・業務委託 … 月額（固定の手当を含む）を暦日で割り、毎日その人の所属店に配る
 * 会社負担の社会保険料（法定福利費）は含めない
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

/** 毎日配る分（月給・業務委託の月額と、固定の手当） */
export function dailyFixedCost(type: PayType, amount: number, allowances: number, daysInMonth: number) {
  const monthly = type === "monthly" || type === "contract" ? amount : 0;
  return (monthly + (type === "contract" ? 0 : allowances)) / daysInMonth;
}
