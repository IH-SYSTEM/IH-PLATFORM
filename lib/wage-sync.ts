import "server-only";
import { businessDayJST } from "@/lib/business-day";
import { dayBefore } from "@/lib/payroll/wage-history";
import { createAdminClient } from "@/lib/supabase/admin";

export const AMOUNT_KEY = { monthly: "baseSalary", daily: "dailyWage", hourly: "hourlyWage", contract: "contractAmount" } as const;
export type WageType = keyof typeof AMOUNT_KEY;
export const WAGE_TYPE_LABEL: Record<WageType, string> = { monthly: "月給", daily: "日給", hourly: "時給", contract: "業務委託" };

/**
 * 給与設定の履歴に新しい行を足す（今の行は前日で終わらせる）。今日以前から有効なら給与マスタにも写す。
 * 失敗したら理由を返す
 */
export async function addWageRow(staffId: string, row: { from: string; type: WageType; amount: number; note: string | null; by: string }) {
  const admin = createAdminClient();
  const { data: open } = await admin.from("staff_wage_history").select("id, valid_from, employment_type, amount").eq("staff_id", staffId).is("valid_to", null).maybeSingle();
  if (open && open.valid_from >= row.from) return "今の設定の開始日より後の日付を選んでください（前の日付に直すときは、いちばん新しい行を消してから足してください）";
  if (open && open.employment_type === row.type && open.amount === row.amount) return null; // 変わっていない
  if (open) await admin.from("staff_wage_history").update({ valid_to: dayBefore(row.from) }).eq("id", open.id);
  const { error } = await admin.from("staff_wage_history").insert({ staff_id: staffId, valid_from: row.from, employment_type: row.type, amount: row.amount, note: row.note, created_by: row.by });
  if (error) return `保存できませんでした（${error.message}）`;
  if (row.from <= businessDayJST()) await syncMaster(staffId, row.type, row.amount);
  return null;
}

/** 給与マスタの「給与の形」と金額を、履歴の行に合わせる */
export async function syncMaster(staffId: string, type: WageType, amount: number) {
  const admin = createAdminClient();
  const { data } = await admin.from("staff").select("payroll_master").eq("id", staffId).single();
  const pm = { ...((data?.payroll_master ?? {}) as Record<string, unknown>), employmentType: type, [AMOUNT_KEY[type]]: amount };
  await admin.from("staff").update({ payroll_master: pm }).eq("id", staffId);
}

/**
 * スタッフ管理の給与マスタで金額を変えたとき、履歴にも反映する。
 * 履歴がなければ入社日（なければ今日）からの1行目を作り、今の行と違えば今日から新しい行を足す（今日始まった行なら書き換える）
 */
export async function syncHistoryFromMaster(staffId: string, master: Record<string, unknown>, hireDate: string | null, by: string) {
  const type = master.employmentType as WageType;
  if (!(type in AMOUNT_KEY)) return;
  const amount = Number(master[AMOUNT_KEY[type]] ?? 0);
  if (!amount) return;
  const admin = createAdminClient();
  const today = businessDayJST();
  const { data: open } = await admin.from("staff_wage_history").select("id, valid_from, employment_type, amount").eq("staff_id", staffId).is("valid_to", null).maybeSingle();
  if (open && open.employment_type === type && open.amount === amount) return;
  if (open && open.valid_from >= today) {
    await admin.from("staff_wage_history").update({ employment_type: type, amount, created_by: by }).eq("id", open.id);
    return;
  }
  const { count } = await admin.from("staff_wage_history").select("id", { count: "exact", head: true }).eq("staff_id", staffId);
  const from = count ? today : (hireDate ?? today);
  await addWageRow(staffId, { from, type, amount, note: count ? "スタッフ管理で変更" : "最初の設定", by });
}
