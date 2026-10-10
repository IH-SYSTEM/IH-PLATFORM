"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canApprove, hasDuty, noDutyMessage } from "@/lib/duties";
import { pushLine } from "@/lib/line-push";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * 給与の入力（経理・入力の担当）。保存はいつも下書き。確定済みのものを直すと下書きに戻り、承認し直しになる。
 * 確定は confirmSalary（経理・承認の担当か代表。入力した本人はできない）
 */
export async function saveSalary(staffId: string, year: number, month: number, _prev: SalarySaveState, fd: FormData): Promise<SalarySaveState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input")) return { error: noDutyMessage("keiri_input"), at: Date.now() };
  const status = "draft" as const;
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
    drafted_by: me.id,
    confirmed_by: null,
    confirmed_at: null,
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

export type ApproveState = { ok?: string; error?: string; at?: number } | undefined;

async function draftFor(staffId: string, year: number, month: number) {
  const { data } = await createAdminClient()
    .from("salary_records")
    .select("id, status, drafted_by, staff_name")
    .eq("staff_id", staffId)
    .eq("year", year)
    .eq("month", month)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** 給与を確定する（経理・承認の担当か代表）。入力した本人は確定できない。確定すると本人の給与明細に出る */
export async function confirmSalary(staffId: string, year: number, month: number, _prev: ApproveState): Promise<ApproveState> {
  const me = await requireAdmin();
  if (!canApprove(me, "keiri_approve")) return { error: "確定できるのは「経理（承認）」の担当か代表だけです", at: Date.now() };
  const rec = await draftFor(staffId, year, month);
  if (!rec) return { error: "まだ入力されていません", at: Date.now() };
  if (rec.status === "confirmed") return { error: "もう確定しています", at: Date.now() };
  if (rec.drafted_by === me.id) return { error: "自分で入力した給与は確定できません。ほかの承認の人に頼んでください", at: Date.now() };
  const { error } = await createAdminClient()
    .from("salary_records")
    .update({ status: "confirmed", confirmed_by: me.id, confirmed_at: new Date().toISOString() })
    .eq("id", rec.id)
    .eq("status", "draft");
  if (error) return { error: "確定できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "salary", targetId: rec.id, subject: staffId, detail: { confirm: `${year}-${month}` } });
  revalidatePath("/admin/salary");
  revalidatePath(`/admin/salary/${staffId}`);
  revalidatePath("/me");
  return { ok: "確定しました。本人の給与明細に出ます", at: Date.now() };
}

/** 差し戻す（経理・承認の担当か代表）。確定済みなら下書きに戻し、入力した人に理由を LINE で知らせる */
export async function returnSalary(staffId: string, year: number, month: number, _prev: ApproveState, fd: FormData): Promise<ApproveState> {
  const me = await requireAdmin();
  if (!canApprove(me, "keiri_approve")) return { error: "差し戻せるのは「経理（承認）」の担当か代表だけです", at: Date.now() };
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { error: "直してほしいところを書いてください", at: Date.now() };
  const rec = await draftFor(staffId, year, month);
  if (!rec) return { error: "まだ入力されていません", at: Date.now() };
  const admin = createAdminClient();
  await admin.from("salary_records").update({ status: "draft", confirmed_by: null, confirmed_at: null }).eq("id", rec.id);
  await audit({ actor: me.id, action: "update", targetType: "salary", targetId: rec.id, subject: staffId, detail: { return: `${year}-${month}`, reason } });
  if (rec.drafted_by) {
    const { data: drafter } = await admin.from("staff").select("line_user_id").eq("id", rec.drafted_by).maybeSingle();
    await pushLine([drafter?.line_user_id], `【給与の差し戻し】${rec.staff_name}さん ${year}年${month}月分\n${me.name}さんより：${reason}\n\nIH ポータル → 給与入力 で直してください`, "report");
  }
  revalidatePath("/admin/salary");
  revalidatePath(`/admin/salary/${staffId}`);
  revalidatePath("/me");
  return { ok: "差し戻しました。入力した人に LINE で知らせました", at: Date.now() };
}
