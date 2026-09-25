export const PERMISSIONS = [
  { value: "member", label: "一般スタッフ" },
  { value: "store", label: "店長" },
  { value: "admin", label: "管理者" },
  { value: "superadmin", label: "特別管理者" },
] as const;

export function permissionLabel(p: string | null | undefined) {
  return PERMISSIONS.find((x) => x.value === p)?.label ?? "一般スタッフ";
}

export const EMPLOYMENT_TYPES = [
  { value: "monthly", label: "月給" },
  { value: "daily", label: "日給" },
  { value: "hourly", label: "時給" },
  { value: "contract", label: "業務委託（固定額）" },
] as const;

export const ALLOWANCES = [
  { key: "position", label: "役職手当" },
  { key: "sales", label: "売上手当" },
  { key: "attendance", label: "皆勤手当" },
  { key: "transport", label: "通勤手当" },
  { key: "housing", label: "住宅手当" },
  { key: "adjustment", label: "調整手当" },
  { key: "other", label: "その他手当" },
] as const;

export const DEDUCTIONS = [
  { key: "residentTaxMonthly", label: "住民税（月額）" },
  { key: "childSupportDeduction", label: "子ども・子育て支援金" },
  { key: "savingsDeduction", label: "積立" },
  { key: "repaymentDeduction", label: "返済" },
  { key: "otherDeduction", label: "その他控除" },
] as const;

export const AGE_GROUPS = [
  { value: "under40", label: "40歳未満" },
  { value: "40-64", label: "40〜64歳（介護保険あり）" },
  { value: "65-69", label: "65〜69歳" },
  { value: "over70", label: "70歳以上" },
] as const;

export function ageGroupFor(birthdate: string | null, today = new Date()): string {
  if (!birthdate) return "under40";
  const b = new Date(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  if (today < new Date(today.getFullYear(), b.getMonth(), b.getDate())) age--;
  if (age >= 70) return "over70";
  if (age >= 65) return "65-69";
  if (age >= 40) return "40-64";
  return "under40";
}

export type PayrollMaster = {
  employmentType?: string;
  baseSalary?: number;
  workingDays?: number;
  annualWorkingDays?: number;
  dailyWage?: number;
  hourlyWage?: number;
  contractAmount?: number;
  allowances?: Record<string, number>;
  socialInsurance?: { enrolled?: boolean; ageGroup?: string; [k: string]: unknown };
  incomeTaxColumn?: string;
  dependentCount?: number;
  residentTaxMonthly?: number;
  childSupportDeduction?: number;
  savingsDeduction?: number;
  repaymentDeduction?: number;
  otherDeduction?: number;
  [k: string]: unknown;
};

export type StaffRecord = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string;
  furigana: string | null;
  employee_no: string | null;
  role: string | null;
  permission: string | null;
  store_id: string | null;
  department_name: string | null;
  hire_date: string | null;
  birthdate: string | null;
  gender: string | null;
  phone: string | null;
  zipcode: string | null;
  address: string | null;
  emergency: string | null;
  note: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_type: string | null;
  bank_number: string | null;
  bank_holder: string | null;
  mynumber: string | null;
  health_insurance_no: string | null;
  employment_insurance_no: string | null;
  basic_pension_no: string | null;
  welfare_pension_no: string | null;
  line_added: boolean;
  retired: boolean;
  retirement_date: string | null;
  retirement_reason: string | null;
  payroll_master: PayrollMaster | null;
  attachments: { name: string; url: string; type?: string; uploadedAt?: string }[];
};

export const STAFF_COLUMNS =
  "id, auth_user_id, email, name, furigana, employee_no, role, permission, store_id, department_name, hire_date, birthdate, gender, phone, zipcode, address, emergency, note, bank_name, bank_branch, bank_type, bank_number, bank_holder, mynumber, health_insurance_no, employment_insurance_no, basic_pension_no, welfare_pension_no, line_added, retired, retirement_date, retirement_reason, payroll_master, attachments";
