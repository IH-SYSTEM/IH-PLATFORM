"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { syncHistoryFromMaster } from "@/lib/wage-sync";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS } from "@/lib/format";
import { ALLOWANCES, DEDUCTIONS, PERMISSIONS, TEMP_PASSWORD, ageGroupFor, type PayrollMaster } from "@/lib/staff";

export type SaveState = { ok?: boolean; error?: string; at?: number } | undefined;

class InputError extends Error {}

function readForm(fd: FormData) {
  const text = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const date = (k: string, label: string) => {
    const v = text(k);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InputError(`${label}の日付が正しくありません`);
    return v;
  };
  const amount = (k: string, label: string) => {
    const v = String(fd.get(k) ?? "").replace(/[,，\s]/g, "");
    if (v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new InputError(`${label}は0以上の数値で入力してください`);
    return n;
  };
  return { text, date, amount, checked: (k: string) => fd.get(k) === "on" };
}

export async function saveStaff(staffId: string | null, _prev: SaveState, fd: FormData): Promise<SaveState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  let createdId: string | null = null;
  try {
    const { text, date, amount, checked } = readForm(fd);

    const name = text("name");
    const email = text("email")?.toLowerCase() ?? null;
    if (!name) throw new InputError("氏名を入力してください");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("メールアドレスを正しく入力してください");

    const mynumber = text("mynumber")?.replace(/[-\s]/g, "") ?? null;
    if (mynumber && !/^\d{12}$/.test(mynumber)) throw new InputError("マイナンバーは12桁の数字で入力してください");

    const role = text("role");
    if (role && !(role in ROLE_LABELS)) throw new InputError("雇用区分が正しくありません");

    const storeId = text("store_id");
    let storeName: string | null = null;
    let storeCompanyId: string | null = null;
    if (storeId) {
      const { data: store } = await supabase.from("stores").select("name, company_id").eq("id", storeId).single();
      if (!store) throw new InputError("所属店舗が見つかりません");
      storeName = store.name;
      storeCompanyId = store.company_id;
    }

    const birthdate = date("birthdate", "生年月日");
    const retired = checked("retired");

    const { data: existing } = staffId
      ? await supabase.from("staff").select("id, email, permission, auth_user_id, payroll_master").eq("id", staffId).single()
      : { data: null };
    if (staffId && !existing) throw new InputError("スタッフが見つかりません");

    const requested = text("permission") ?? "member";
    if (!PERMISSIONS.some((p) => p.value === requested)) throw new InputError("権限が正しくありません");
    let permission = requested;
    const current = existing?.permission ?? null;
    if (staffId === me.id) {
      permission = current ?? "member";
    } else if ((current === "superadmin" || requested === "superadmin") && current !== requested && me.permission !== "superadmin") {
      throw new InputError("特別管理者の付与・解除は特別管理者のみ行えます");
    }

    const prevPm: PayrollMaster = existing?.payroll_master ?? {};
    // 標準報酬月額の等級（健康保険の1〜50等級）。正社員は必須（2026-10-08 黒田さん決定）
    const gradeRaw = text("pm.socialInsurance.grade");
    const grade = gradeRaw ? Number(gradeRaw) : null;
    if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 50)) throw new InputError("社会保険の等級は1〜50で選んでください");
    if (role === "fulltime" && grade === null) throw new InputError("正社員は、社会保険の等級（標準報酬月額）を入力してください");
    const prevGrade = (prevPm.socialInsurance?.grade as number | undefined) ?? null;
    const payroll_master: PayrollMaster = {
      ...prevPm,
      employmentType: text("pm.employmentType") ?? "",
      baseSalary: amount("pm.baseSalary", "月給"),
      dailyWage: amount("pm.dailyWage", "日給"),
      hourlyWage: amount("pm.hourlyWage", "時給"),
      contractAmount: amount("pm.contractAmount", "業務委託額"),
      workingDays: amount("pm.workingDays", "所定労働日数"),
      annualWorkingDays: amount("pm.annualWorkingDays", "年間労働日数"),
      allowances: {
        ...(prevPm.allowances ?? {}),
        ...Object.fromEntries(ALLOWANCES.map((a) => [a.key, amount(`pm.allowances.${a.key}`, a.label)])),
      },
      socialInsurance: {
        ...(prevPm.socialInsurance ?? {}),
        enrolled: checked("pm.socialInsurance.enrolled"),
        ageGroup: ageGroupFor(birthdate),
        grade: grade ?? undefined,
        // 等級を変えた日。毎年6月〜9月のリマインドで、今年の定時決定を入れたかの判定に使う
        gradeUpdatedAt: grade !== prevGrade ? new Date().toISOString().slice(0, 10) : prevPm.socialInsurance?.gradeUpdatedAt,
      },
      incomeTaxColumn: text("pm.incomeTaxColumn") === "乙" ? "乙" : "甲",
      dependentCount: amount("pm.dependentCount", "扶養人数"),
      ...Object.fromEntries(DEDUCTIONS.map((d) => [d.key, amount(`pm.${d.key}`, d.label)])),
      birthDate: birthdate,
      bankAccount: {
        bankName: text("bank_name") ?? "",
        branchName: text("bank_branch") ?? "",
        accountType: text("bank_type") === "当座" ? "checking" : "ordinary",
        accountNumber: text("bank_number") ?? "",
        accountHolder: text("bank_holder") ?? "",
      },
    };

    const row = {
      name,
      email,
      furigana: text("furigana"),
      employee_no: text("employee_no"),
      role,
      permission,
      store_id: storeId,
      // 年末調整を行う会社。空なら所属店舗の会社を入れておく（空のまま残さない）
      tax_company_id: text("tax_company_id") ?? storeCompanyId,
      department_name: storeName,
      hire_date: date("hire_date", "入社日"),
      birthdate,
      gender: text("gender"),
      phone: text("phone"),
      zipcode: text("zipcode"),
      address: text("address"),
      emergency: text("emergency"),
      note: text("note"),
      bank_name: text("bank_name"),
      bank_branch: text("bank_branch"),
      bank_type: text("bank_type"),
      bank_number: text("bank_number"),
      bank_holder: text("bank_holder"),
      mynumber,
      health_insurance_no: text("health_insurance_no"),
      employment_insurance_no: text("employment_insurance_no"),
      basic_pension_no: text("basic_pension_no"),
      welfare_pension_no: text("welfare_pension_no"),
      line_added: checked("line_added"),
      retired,
      retirement_date: retired ? date("retirement_date", "退職日") : null,
      retirement_reason: retired ? text("retirement_reason") : null,
      payroll_master,
      updated_by: me.id,
    };

    const { data: dup } = await supabase.from("staff").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&"));
    if ((dup ?? []).some((d) => d.id !== staffId)) throw new InputError("このメールアドレスは別のスタッフが使っています");

    if (existing) {
      if (existing.auth_user_id && existing.email?.toLowerCase() !== email) {
        const { error } = await admin.auth.admin.updateUserById(existing.auth_user_id, { email, email_confirm: true });
        if (error) throw new InputError(`ログイン用メールを変更できませんでした（${error.message}）`);
      }
      const { error } = await supabase.from("staff").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
      await syncHistoryFromMaster(existing.id, payroll_master as Record<string, unknown>, row.hire_date ?? null, me.id);
    } else {
      const { data: user, error: authError } = await admin.auth.admin.createUser({ email, password: TEMP_PASSWORD, email_confirm: true, user_metadata: { name } });
      if (authError) throw new InputError(`ログインアカウントを作成できませんでした（${authError.message}）`);
      const { data: inserted, error } = await supabase
        .from("staff")
        .insert({ ...row, auth_user_id: user.user.id, first_login: true, created_by: me.id })
        .select("id")
        .single();
      if (error) {
        await admin.auth.admin.deleteUser(user.user.id);
        throw new Error(error.message);
      }
      createdId = inserted.id;
      await syncHistoryFromMaster(inserted.id, payroll_master as Record<string, unknown>, row.hire_date ?? null, me.id);
    }
  } catch (e) {
    if (e instanceof InputError) return { error: e.message, at: Date.now() };
    console.error("saveStaff failed", e);
    return { error: "保存に失敗しました。時間をおいてもう一度お試しください", at: Date.now() };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  if (createdId) redirect(`/admin/staff/${createdId}?created=1`);
  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true, at: Date.now() };
}

export type TempPasswordState = { ok?: boolean; error?: string; at?: number } | undefined;

// 仮パスワードに戻す（パスワードを忘れた人用）。次のログインで本人が自分のパスワードに変える
export async function setTempPassword(staffId: string): Promise<TempPasswordState> {
  const me = await requireAdmin();
  const password = TEMP_PASSWORD;
  const admin = createAdminClient();
  const { data: staff } = await admin.from("staff").select("retired, auth_user_id").eq("id", staffId).single();
  if (!staff?.auth_user_id) return { error: "ログインアカウントがありません", at: Date.now() };
  if (staff.retired) return { error: "退職済みのスタッフには設定できません", at: Date.now() };
  const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, { password });
  if (error) return { error: `設定できませんでした（${error.message}）`, at: Date.now() };
  await admin.from("staff").update({ first_login: true, invited_at: new Date().toISOString() }).eq("id", staffId);
  await audit({ actor: me.id, action: "update", targetType: "staff", targetId: staffId, detail: { tempPassword: "set" } });
  return { ok: true, at: Date.now() };
}
