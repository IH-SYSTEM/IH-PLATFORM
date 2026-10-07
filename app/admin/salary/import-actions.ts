"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { monthRange } from "@/lib/business-day";
import { calculatePayroll, type Master } from "@/lib/payroll/calculator";
import { normalize, premiumTotal, totals, type EmploymentType, type SalaryValues } from "@/lib/payroll/record";
import { premiumPay, workMonth, type DayInput, type OvertimeRule } from "@/lib/payroll/worktime";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportResult = {
  ok?: boolean;
  error?: string;
  imported?: { name: string; workDays: number; hours: number; overtime: number; night: number }[];
  skippedConfirmed?: string[];
  noMaster?: string[];
  openDays?: { name: string; dates: string[] }[];
  at?: number;
};

const TYPES: EmploymentType[] = ["monthly", "daily", "hourly", "contract"];
const hours = (min: number) => Math.round((min / 60) * 100) / 100;
const mondayOf = (ymd: string) => {
  const ms = Date.parse(`${ymd}T12:00:00Z`);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};

/**
 * 「勤怠から取り込む」。その月の打刻とシフトから、出勤日数・勤務時間・残業・深夜・休日・遅刻・早退・有給を計算し、
 * 給与入力に下書きとして入れる。確定済みの人は上書きしない。社会保険料・所得税は割増込みで計算し直す
 */
export async function importAttendance(year: number, month: number, _prev: ImportResult | undefined): Promise<ImportResult> {
  const me = await requireAdmin();
  if (!Number.isInteger(year) || month < 1 || month > 12) return { error: "対象月が正しくありません", at: Date.now() };
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const { start, end } = monthRange(ym);
  const from = mondayOf(start); // 月の最初の週の残業を正しく数えるため、その週の月曜から読む
  const admin = createAdminClient();

  const [{ data: attendance }, { data: shifts }, { data: stores }, { data: records }] = await Promise.all([
    admin.from("attendance").select("staff_id, store_id, date, checkin_time, checkout_time, break_minutes").gte("date", from).lte("date", end).limit(10000),
    admin.from("shift_schedule").select("staff_id, work_date, shift_type, planned_start, planned_end").gte("work_date", from).lte("work_date", end).limit(10000),
    admin.from("stores").select("id, overtime_rule"),
    admin.from("salary_records").select("id, staff_id, status, employment_type, attendance, payment, deduction").eq("year", year).eq("month", month),
  ]);
  const staffIds = [...new Set([...(attendance ?? []), ...(shifts ?? []).filter((s) => s.work_date >= start)].map((r) => r.staff_id))];
  if (!staffIds.length) return { ok: true, imported: [], skippedConfirmed: [], noMaster: [], openDays: [], at: Date.now() };
  const { data: people } = await admin.from("staff").select("id, name, payroll_master").in("id", staffIds);

  const ruleOf = new Map((stores ?? []).map((s) => [s.id, s.overtime_rule as OvertimeRule]));
  const shiftOf = new Map((shifts ?? []).map((s) => [`${s.staff_id}:${s.work_date}`, s]));
  const recordOf = new Map((records ?? []).map((r) => [r.staff_id, r]));
  const result: Required<Omit<ImportResult, "error" | "at" | "ok">> = { imported: [], skippedConfirmed: [], noMaster: [], openDays: [] };

  for (const p of people ?? []) {
    const master = (p.payroll_master ?? {}) as Master;
    const type = master.employmentType as EmploymentType;
    if (!TYPES.includes(type)) {
      result.noMaster.push(p.name);
      continue;
    }
    const existing = recordOf.get(p.id);
    if (existing?.status === "confirmed") {
      result.skippedConfirmed.push(p.name);
      continue;
    }

    const days: DayInput[] = (attendance ?? [])
      .filter((a) => a.staff_id === p.id)
      .map((a) => {
        const s = shiftOf.get(`${p.id}:${a.date}`);
        return {
          date: a.date,
          rule: ruleOf.get(a.store_id) ?? "statutory",
          checkin: a.checkin_time,
          checkout: a.checkout_time,
          breakMinutes: a.break_minutes ?? 0,
          shift: s?.shift_type === "work" && s.planned_start && s.planned_end ? { start: s.planned_start, end: s.planned_end } : null,
        };
      });
    const sum = workMonth(days, start, end);
    const monthShifts = (shifts ?? []).filter((s) => s.staff_id === p.id && s.work_date >= start);
    const paidLeave = monthShifts.filter((s) => s.shift_type === "paid_leave").length;
    const specialLeave = monthShifts.filter((s) => s.shift_type === "special").length;
    const amount = { monthly: master.baseSalary, daily: master.dailyWage, hourly: master.hourlyWage, contract: master.contractAmount }[type] ?? 0;
    const premiums = type === "contract" ? { overtimePay: 0, nightPay: 0, holidayPay: 0, paidLeavePay: 0 } : premiumPay(type, amount, sum, paidLeave);
    if (sum.openDays.length) result.openDays.push({ name: p.name, dates: sum.openDays });

    const prev = (existing ?? null) as { attendance: Record<string, number>; payment: Record<string, number>; deduction: Record<string, number> } | null;
    const attendanceValues: Record<string, number> = {
      ...(prev?.attendance ?? {}),
      workDays: sum.workDays,
      paidLeave,
      specialLeave,
      lateCount: sum.lateCount,
      earlyLeaveCount: sum.earlyLeaveCount,
      overtimeHours: hours(sum.overtimeMinutes),
      nightHours: hours(sum.nightMinutes),
      holidayHours: hours(sum.holidayMinutes),
      lateMinutes: sum.lateMinutes,
      earlyLeaveMinutes: sum.earlyLeaveMinutes,
    };
    if (type === "hourly") {
      attendanceValues.hourlyWage = master.hourlyWage ?? 0;
      attendanceValues.workHours = hours(sum.workMinutes);
    }

    const draft: SalaryValues = {
      employmentType: type,
      attendance: attendanceValues,
      payment: { ...(prev?.payment ?? {}), ...premiums },
      deduction: { ...(prev?.deduction ?? {}) },
    };
    // 給与マスタから基本給・手当・控除を計算する（下書きが既にあれば手当と住民税などはそのまま、社会保険・所得税だけ割増込みで計算し直す）
    const calc = calculatePayroll(master, { workDays: sum.workDays, absenceDays: attendanceValues.absenceDays ?? 0, workHours: attendanceValues.workHours ?? 0, hourlyWage: master.hourlyWage ?? 0 }, premiumTotal(draft));
    if (!prev) {
      if (type === "monthly") draft.payment.baseSalary = calc.base;
      if (type === "daily") draft.payment.dailyWage = master.dailyWage ?? 0;
      if (type === "contract") draft.payment.contractAmount = calc.base;
      const keyOf = { position: "positionAllowance", sales: "salesAllowance", attendance: "attendanceAllowance", transport: "transportAllowance", housing: "housingAllowance", adjustment: "adjustmentAllowance", other: "otherAllowance" } as const;
      for (const [k, v] of Object.entries(calc.allowances)) draft.payment[keyOf[k as keyof typeof keyOf]] = v;
      draft.deduction = { residentTax: calc.residentTax, savings: calc.savings, repayment: calc.repayment, childSupport: calc.childSupport, otherDeduction: calc.otherDeduction };
    }
    if (type !== "contract") {
      Object.assign(draft.deduction, { healthInsurance: calc.healthInsurance, careInsurance: calc.careInsurance, pension: calc.pension, employmentInsurance: calc.employmentInsurance, incomeTax: calc.incomeTax });
    }

    const values = normalize(draft);
    const t = totals(values);
    const row = {
      staff_id: p.id,
      staff_name: p.name,
      year,
      month,
      employment_type: type,
      attendance: values.attendance,
      payment: values.payment,
      deduction: values.deduction,
      total_payment: t.totalPayment,
      total_deduction: t.totalDeduction,
      net_payment: t.netPayment,
      status: "draft",
    };
    const { error } = existing
      ? await admin.from("salary_records").update(row).eq("id", existing.id)
      : await admin.from("salary_records").insert(row);
    if (error) {
      console.error("importAttendance failed", p.id, error);
      return { error: `${p.name}さんの取り込みに失敗しました`, ...result, at: Date.now() };
    }
    result.imported.push({ name: p.name, workDays: sum.workDays, hours: hours(sum.workMinutes), overtime: hours(sum.overtimeMinutes), night: hours(sum.nightMinutes) });
  }

  await audit({ actor: me.id, action: "update", targetType: "salary", detail: { importAttendance: ym, imported: result.imported.length, skipped: result.skippedConfirmed.length } });
  revalidatePath("/admin/salary");
  return { ok: true, ...result, at: Date.now() };
}
