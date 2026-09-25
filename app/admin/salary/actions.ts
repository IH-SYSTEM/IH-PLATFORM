"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalize, totals, type EmploymentType, type SalaryValues } from "@/lib/payroll/record";

export type SalarySaveState = { ok?: boolean; status?: "draft" | "confirmed"; error?: string; at?: number } | undefined;

const TYPES: EmploymentType[] = ["monthly", "daily", "hourly", "contract"];

function parseValues(raw: string): SalaryValues {
  const v = JSON.parse(raw) as SalaryValues;
  if (!TYPES.includes(v.employmentType)) throw new Error("給与形態を選択してください");
  for (const group of [v.attendance, v.payment, v.deduction]) {
    for (const [k, n] of Object.entries(group ?? {})) {
      if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100_000_000) throw new Error(`入力値が正しくありません（${k}）`);
    }
  }
  for (const [k, n] of Object.entries(v.attendance ?? {})) if (n < 0) throw new Error(`勤怠の値はマイナスにできません（${k}）`);
  const moneyKeys = [...Object.entries(v.payment ?? {}), ...Object.entries(v.deduction ?? {}), ["hourlyWage", v.attendance?.hourlyWage ?? 0]] as [string, number][];
  if (moneyKeys.some(([, n]) => !Number.isInteger(n))) throw new Error("金額は1円単位（小数なし）で入力してください");
  return normalize({ employmentType: v.employmentType, attendance: v.attendance ?? {}, payment: v.payment ?? {}, deduction: v.deduction ?? {} });
}

export async function saveSalary(staffId: string, year: number, month: number, _prev: SalarySaveState, fd: FormData): Promise<SalarySaveState> {
  await requireAdmin();
  const status = fd.get("status") === "confirmed" ? "confirmed" : "draft";
  let values: SalaryValues;
  try {
    values = parseValues(String(fd.get("values") ?? "{}"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "入力値が正しくありません", at: Date.now() };
  }
  if (!Number.isInteger(year) || month < 1 || month > 12) return { error: "対象月が正しくありません", at: Date.now() };

  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("name").eq("id", staffId).single();
  if (!staff) return { error: "スタッフが見つかりません", at: Date.now() };

  const t = totals(values);
  const row = {
    staff_id: staffId,
    staff_name: staff.name,
    year,
    month,
    employment_type: values.employmentType,
    attendance: values.attendance,
    payment: values.payment,
    deduction: values.deduction,
    total_payment: t.totalPayment,
    total_deduction: t.totalDeduction,
    net_payment: t.netPayment,
    memo: String(fd.get("memo") ?? "").trim() || null,
    status,
  };

  const { data: existing } = await supabase
    .from("salary_records")
    .select("id")
    .eq("staff_id", staffId)
    .eq("year", year)
    .eq("month", month)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("salary_records").update(row).eq("id", existing.id)
    : await supabase.from("salary_records").insert(row);
  if (error) {
    console.error("saveSalary failed", error);
    return { error: "保存に失敗しました。時間をおいてもう一度お試しください", at: Date.now() };
  }

  revalidatePath("/admin/salary");
  revalidatePath("/admin");
  revalidatePath("/me");
  return { ok: true, status, at: Date.now() };
}
