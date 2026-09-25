"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS } from "@/lib/format";
import { ALLOWANCES, DEDUCTIONS, PERMISSIONS, ageGroupFor, type PayrollMaster } from "@/lib/staff";

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
    if (storeId) {
      const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
      if (!store) throw new InputError("所属店舗が見つかりません");
      storeName = store.name;
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
    } else {
      const { data: user, error: authError } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
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

export type LinkState = { url?: string; error?: string } | undefined;

// 本人に渡すパスワード設定用リンク（新規登録・パスワード忘れ用、1回限り有効）
export async function issuePasswordLink(staffId: string): Promise<LinkState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("email, retired, auth_user_id").eq("id", staffId).single();
  if (!staff?.email || !staff.auth_user_id) return { error: "ログインアカウントがありません" };
  if (staff.retired) return { error: "退職済みのスタッフには発行できません" };

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: staff.email });
  if (error) return { error: "リンクを発行できませんでした" };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "recovery");
  await supabase.from("staff").update({ invited_at: new Date().toISOString() }).eq("id", staffId);
  return { url: url.toString() };
}
