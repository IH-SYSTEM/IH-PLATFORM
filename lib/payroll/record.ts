// 給与レコードの形（Firestore 版と同じキー名。旧データと互換）と合計計算。画面とサーバーで共通に使う
import { yenRound } from "./calculator";

export type EmploymentType = "monthly" | "daily" | "hourly" | "contract";

export const ATTENDANCE_FIELDS = [
  { key: "workDays", label: "出勤日数", unit: "日" },
  { key: "paidLeave", label: "有給休暇", unit: "日" },
  { key: "specialLeave", label: "慶弔休暇", unit: "日" },
  { key: "absenceDays", label: "欠勤日数", unit: "日" },
  { key: "lateCount", label: "遅刻", unit: "回" },
  { key: "earlyLeaveCount", label: "早退", unit: "回" },
] as const;

export const PAYMENT_BASE_FIELDS: Record<EmploymentType, { key: string; label: string } | null> = {
  monthly: { key: "baseSalary", label: "基本給" },
  daily: { key: "dailyWage", label: "日給単価" },
  hourly: null,
  contract: { key: "contractAmount", label: "業務委託支払額" },
};

export const ALLOWANCE_FIELDS = [
  { key: "positionAllowance", master: "position", label: "役職手当" },
  { key: "salesAllowance", master: "sales", label: "売上手当" },
  { key: "attendanceAllowance", master: "attendance", label: "皆勤手当" },
  { key: "transportAllowance", master: "transport", label: "通勤手当" },
  { key: "housingAllowance", master: "housing", label: "住宅手当" },
  { key: "adjustmentAllowance", master: "adjustment", label: "調整金" },
  { key: "otherAllowance", master: "other", label: "その他手当" },
] as const;

export const DEDUCTION_FIELDS = [
  { key: "healthInsurance", label: "健康保険" },
  { key: "careInsurance", label: "介護保険" },
  { key: "pension", label: "厚生年金" },
  { key: "employmentInsurance", label: "雇用保険" },
  { key: "childSupport", label: "子ども・子育て支援金" },
  { key: "incomeTax", label: "所得税" },
  { key: "residentTax", label: "住民税" },
  { key: "savings", label: "積立金" },
  { key: "repayment", label: "返済金" },
  { key: "otherDeduction", label: "その他控除" },
] as const;

export type SalaryValues = {
  employmentType: EmploymentType;
  attendance: Record<string, number>;
  payment: Record<string, number>;
  deduction: Record<string, number>;
};

export function basePay(v: SalaryValues) {
  const p = v.payment;
  const a = v.attendance;
  switch (v.employmentType) {
    case "monthly":
      return p.baseSalary || 0;
    case "daily":
      return (p.dailyWage || 0) * (a.workDays || 0);
    case "hourly":
      return yenRound((a.hourlyWage || 0) * (a.workHours || 0));
    case "contract":
      return p.contractAmount || 0;
  }
}

export function totals(v: SalaryValues) {
  const allowances = v.employmentType === "contract" ? 0 : ALLOWANCE_FIELDS.reduce((s, f) => s + (v.payment[f.key] || 0), 0);
  const totalPayment = basePay(v) + allowances;
  const totalDeduction = v.employmentType === "contract" ? 0 : DEDUCTION_FIELDS.reduce((s, f) => s + (v.deduction[f.key] || 0), 0);
  return { totalPayment, totalDeduction, netPayment: totalPayment - totalDeduction };
}

// 保存用の形に整える（雇用形態に関係ないキーは落とす。旧システムと同じルール）
export function normalize(v: SalaryValues): SalaryValues {
  const attendance: Record<string, number> = {};
  for (const f of ATTENDANCE_FIELDS) attendance[f.key] = v.attendance[f.key] || 0;
  if (v.employmentType === "hourly") {
    attendance.hourlyWage = v.attendance.hourlyWage || 0;
    attendance.workHours = v.attendance.workHours || 0;
  }
  const payment: Record<string, number> = {};
  const baseField = PAYMENT_BASE_FIELDS[v.employmentType];
  if (baseField) payment[baseField.key] = v.payment[baseField.key] || 0;
  if (v.employmentType !== "contract") for (const f of ALLOWANCE_FIELDS) payment[f.key] = v.payment[f.key] || 0;
  const deduction: Record<string, number> = {};
  if (v.employmentType !== "contract") for (const f of DEDUCTION_FIELDS) deduction[f.key] = v.deduction[f.key] || 0;
  return { employmentType: v.employmentType, attendance, payment, deduction };
}
