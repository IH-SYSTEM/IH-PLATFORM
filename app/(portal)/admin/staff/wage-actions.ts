"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { hasDuty, noDutyMessage } from "@/lib/duties";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { addWageRow, syncMaster, AMOUNT_KEY, type WageType } from "@/lib/wage-sync";

export type WageState = { ok?: boolean; error?: string; at?: number } | undefined;

export async function addWage(staffId: string, _prev: WageState, fd: FormData): Promise<WageState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "soumu")) return { error: noDutyMessage("soumu"), at: Date.now() };
  const from = String(fd.get("valid_from") ?? "");
  const type = String(fd.get("employment_type") ?? "") as WageType;
  const amount = Number(String(fd.get("amount") ?? "").replace(/[,，円]/g, ""));
  const note = String(fd.get("note") ?? "").trim().slice(0, 200) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { error: "開始日を選んでください", at: Date.now() };
  if (!(type in AMOUNT_KEY)) return { error: "給与の形を選んでください", at: Date.now() };
  if (!Number.isInteger(amount) || amount <= 0) return { error: "金額を入れてください", at: Date.now() };
  const error = await addWageRow(staffId, { from, type, amount, note, by: me.id });
  if (error) return { error, at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "staff_wage", targetId: staffId, detail: { from, type, amount } });
  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true, at: Date.now() };
}

/** いちばん新しい行を消し、1つ前の行を「今の設定」に戻す（入れ間違いの訂正用） */
export async function deleteLatestWage(staffId: string) {
  const me = await requireAdmin();
  if (!hasDuty(me, "soumu")) throw new Error(noDutyMessage("soumu"));
  const admin = createAdminClient();
  const { data: rows } = await admin.from("staff_wage_history").select("id, employment_type, amount").eq("staff_id", staffId).order("valid_from", { ascending: false }).limit(2);
  if (!rows?.length) return;
  await admin.from("staff_wage_history").delete().eq("id", rows[0].id);
  if (rows[1]) {
    await admin.from("staff_wage_history").update({ valid_to: null }).eq("id", rows[1].id);
    await syncMaster(staffId, rows[1].employment_type as WageType, rows[1].amount);
  }
  await audit({ actor: me.id, action: "delete", targetType: "staff_wage", targetId: staffId, detail: { removed: rows[0] } });
  revalidatePath(`/admin/staff/${staffId}`);
}
