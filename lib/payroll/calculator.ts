// 旧システム payroll-calculator.js の移植。変更点は時給の基本給の端数処理のみ
// （旧：切り捨て → 新：50銭未満切り捨て・50銭以上切り上げ。手入力時の合計と一致させるため）
import {
  BASIC_DEDUCTION_MONTHLY,
  DEPENDENT_DEDUCTION_PER_PERSON,
  INCOME_TAX_BRACKETS,
  INSURANCE_RATES,
  STANDARD_MONTHLY_REMUNERATION,
  salaryIncomeDeductionMonthly,
} from "./tables";

export type Master = {
  employmentType?: string;
  baseSalary?: number;
  workingDays?: number;
  dailyWage?: number;
  hourlyWage?: number;
  contractAmount?: number;
  allowances?: Partial<Record<AllowanceKey, number>>;
  socialInsurance?: { enrolled?: boolean; ageGroup?: string; grade?: number };
  industry?: string;
  dependentCount?: number;
  residentTaxMonthly?: number;
  savingsDeduction?: number;
  repaymentDeduction?: number;
  childSupportDeduction?: number;
  otherDeduction?: number;
};

export type AllowanceKey = "position" | "sales" | "attendance" | "transport" | "housing" | "adjustment" | "other";

export type CalcAttendance = { workDays: number; absenceDays: number; hourlyWage: number; workHours: number };

export function yenRound(v: number) {
  return Math.round(v);
}

export function baseSalary(m: Master, a: CalcAttendance) {
  switch (m.employmentType) {
    case "monthly": {
      const base = m.baseSalary || 0;
      const workingDays = m.workingDays || 22;
      const deduction = workingDays > 0 ? Math.floor((base / workingDays) * (a.absenceDays || 0)) : 0;
      return Math.max(0, base - deduction);
    }
    case "daily":
      return (m.dailyWage || 0) * (a.workDays || 0);
    case "hourly":
      return yenRound((m.hourlyWage || a.hourlyWage || 0) * (a.workHours || 0));
    case "contract":
      return m.contractAmount || 0;
    default:
      return 0;
  }
}

export function standardRemuneration(amount: number) {
  return (
    STANDARD_MONTHLY_REMUNERATION.find((r) => amount >= r.from && amount < r.to) ??
    STANDARD_MONTHLY_REMUNERATION[STANDARD_MONTHLY_REMUNERATION.length - 1]
  );
}

export function socialInsurance(gross: number, m: Master) {
  const si = m.socialInsurance ?? {};
  if (!si.enrolled) return { health: 0, care: 0, pension: 0, employment: 0, total: 0, standardMonthly: 0, grade: null as number | null };

  const row = (si.grade && STANDARD_MONTHLY_REMUNERATION.find((r) => r.grade === si.grade)) || standardRemuneration(gross);
  const ageGroup = si.ageGroup || "under40";
  const rate = INSURANCE_RATES.employment[m.industry || "general"] ?? INSURANCE_RATES.employment.general;

  const health = Math.floor((row.monthly * INSURANCE_RATES.health) / 2);
  const care = ageGroup === "40-64" ? Math.floor((row.monthly * INSURANCE_RATES.healthCare) / 2) : 0;
  const pension = ageGroup === "over70" ? 0 : Math.floor((row.monthly * INSURANCE_RATES.pension) / 2);
  const employment = Math.floor(gross * rate);
  return { health, care, pension, employment, total: health + care + pension + employment, standardMonthly: row.monthly, grade: row.grade };
}

// 月額表 甲欄（電子計算機等の特例）。乙欄は未対応
export function incomeTax(gross: number, insuranceTotal: number, dependents = 0) {
  const afterInsurance = gross - insuranceTotal;
  if (afterInsurance <= 0) return 0;
  const deductions =
    salaryIncomeDeductionMonthly(afterInsurance) + (dependents || 0) * DEPENDENT_DEDUCTION_PER_PERSON + BASIC_DEDUCTION_MONTHLY;
  const taxable = Math.max(0, afterInsurance - deductions);
  if (taxable <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxable > b.from && taxable <= b.to);
  const tax = bracket ? taxable * bracket.rate - bracket.deduction : 0;
  return Math.max(0, Math.floor(tax));
}

export function calculatePayroll(m: Master, a: CalcAttendance) {
  const base = baseSalary(m, a);
  const al = m.allowances ?? {};
  const allowances = {
    position: al.position || 0,
    sales: al.sales || 0,
    attendance: al.attendance || 0,
    transport: al.transport || 0,
    housing: al.housing || 0,
    adjustment: al.adjustment || 0,
    other: al.other || 0,
  };
  const gross = base + Object.values(allowances).reduce((s, v) => s + v, 0);
  const ins = socialInsurance(gross, m);
  const tax = incomeTax(gross, ins.total, m.dependentCount || 0);
  return {
    base,
    allowances,
    gross,
    healthInsurance: ins.health,
    careInsurance: ins.care,
    pension: ins.pension,
    employmentInsurance: ins.employment,
    standardMonthly: ins.standardMonthly,
    grade: ins.grade,
    incomeTax: tax,
    residentTax: m.residentTaxMonthly || 0,
    savings: m.savingsDeduction || 0,
    repayment: m.repaymentDeduction || 0,
    childSupport: m.childSupportDeduction || 0,
    otherDeduction: m.otherDeduction || 0,
  };
}
