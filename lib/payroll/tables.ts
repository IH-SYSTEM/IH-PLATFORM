// 旧システム（Firebase版 payroll-tax-tables.js）から値を変えずに移植した料率表。
// 出典は旧システムの記載どおり：協会けんぽ 東京都 令和7年3月分〜、雇用保険 令和7年4月〜、国税庁 令和7年分 月額表。
// 熊本支部の料率・令和8年分の改定は未反映。改定時はこのファイルだけを差し替える。
export const TABLE_VERSION = "2025（令和7年）東京都";

export const STANDARD_MONTHLY_REMUNERATION = [
  { grade: 1, monthly: 58000, from: 0, to: 63000 },
  { grade: 2, monthly: 68000, from: 63000, to: 73000 },
  { grade: 3, monthly: 78000, from: 73000, to: 83000 },
  { grade: 4, monthly: 88000, from: 83000, to: 93000 },
  { grade: 5, monthly: 98000, from: 93000, to: 101000 },
  { grade: 6, monthly: 104000, from: 101000, to: 107000 },
  { grade: 7, monthly: 110000, from: 107000, to: 114000 },
  { grade: 8, monthly: 118000, from: 114000, to: 122000 },
  { grade: 9, monthly: 126000, from: 122000, to: 130000 },
  { grade: 10, monthly: 134000, from: 130000, to: 138000 },
  { grade: 11, monthly: 142000, from: 138000, to: 146000 },
  { grade: 12, monthly: 150000, from: 146000, to: 155000 },
  { grade: 13, monthly: 160000, from: 155000, to: 165000 },
  { grade: 14, monthly: 170000, from: 165000, to: 175000 },
  { grade: 15, monthly: 180000, from: 175000, to: 185000 },
  { grade: 16, monthly: 190000, from: 185000, to: 195000 },
  { grade: 17, monthly: 200000, from: 195000, to: 210000 },
  { grade: 18, monthly: 220000, from: 210000, to: 230000 },
  { grade: 19, monthly: 240000, from: 230000, to: 250000 },
  { grade: 20, monthly: 260000, from: 250000, to: 270000 },
  { grade: 21, monthly: 280000, from: 270000, to: 290000 },
  { grade: 22, monthly: 300000, from: 290000, to: 310000 },
  { grade: 23, monthly: 320000, from: 310000, to: 330000 },
  { grade: 24, monthly: 340000, from: 330000, to: 350000 },
  { grade: 25, monthly: 360000, from: 350000, to: 370000 },
  { grade: 26, monthly: 380000, from: 370000, to: 395000 },
  { grade: 27, monthly: 410000, from: 395000, to: 425000 },
  { grade: 28, monthly: 440000, from: 425000, to: 455000 },
  { grade: 29, monthly: 470000, from: 455000, to: 485000 },
  { grade: 30, monthly: 500000, from: 485000, to: 515000 },
  { grade: 31, monthly: 530000, from: 515000, to: 545000 },
  { grade: 32, monthly: 560000, from: 545000, to: 575000 },
  { grade: 33, monthly: 590000, from: 575000, to: 605000 },
  { grade: 34, monthly: 620000, from: 605000, to: 635000 },
  { grade: 35, monthly: 650000, from: 635000, to: 665000 },
  { grade: 36, monthly: 680000, from: 665000, to: 695000 },
  { grade: 37, monthly: 710000, from: 695000, to: 730000 },
  { grade: 38, monthly: 750000, from: 730000, to: 770000 },
  { grade: 39, monthly: 790000, from: 770000, to: 810000 },
  { grade: 40, monthly: 830000, from: 810000, to: 855000 },
  { grade: 41, monthly: 880000, from: 855000, to: 905000 },
  { grade: 42, monthly: 930000, from: 905000, to: 955000 },
  { grade: 43, monthly: 980000, from: 955000, to: 1005000 },
  { grade: 44, monthly: 1030000, from: 1005000, to: 1055000 },
  { grade: 45, monthly: 1090000, from: 1055000, to: 1115000 },
  { grade: 46, monthly: 1150000, from: 1115000, to: 1175000 },
  { grade: 47, monthly: 1210000, from: 1175000, to: 1235000 },
  { grade: 48, monthly: 1270000, from: 1235000, to: 1295000 },
  { grade: 49, monthly: 1330000, from: 1295000, to: 1355000 },
  { grade: 50, monthly: 1390000, from: 1355000, to: Infinity },
];

export const INSURANCE_RATES = {
  health: 0.0991,
  healthCare: 0.0159,
  pension: 0.183,
  employment: {
    general: 0.0055,
    construction: 0.0065,
    agriculture: 0.0065,
  } as Record<string, number>,
};

export const INCOME_TAX_BRACKETS = [
  { from: 0, to: 162500, rate: 0.05105, deduction: 0 },
  { from: 162500, to: 275000, rate: 0.1021, deduction: 8296 },
  { from: 275000, to: 579167, rate: 0.2042, deduction: 36374 },
  { from: 579167, to: 750000, rate: 0.23483, deduction: 54113 },
  { from: 750000, to: 1500000, rate: 0.33693, deduction: 130688 },
  { from: 1500000, to: 3500000, rate: 0.4084, deduction: 237893 },
  { from: 3500000, to: Infinity, rate: 0.45945, deduction: 416560 },
];

export const DEPENDENT_DEDUCTION_PER_PERSON = 31667;
export const BASIC_DEDUCTION_MONTHLY = 38333;

export function salaryIncomeDeductionMonthly(grossMonthly: number) {
  const annual = grossMonthly * 12;
  let deduction: number;
  if (annual <= 1625000) deduction = 550000;
  else if (annual <= 1800000) deduction = annual * 0.4 - 100000;
  else if (annual <= 3600000) deduction = annual * 0.3 + 80000;
  else if (annual <= 6600000) deduction = annual * 0.2 + 440000;
  else if (annual <= 8500000) deduction = annual * 0.1 + 1100000;
  else deduction = 1950000;
  return Math.floor(deduction / 12);
}
