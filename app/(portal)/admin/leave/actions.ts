"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasDuty, noDutyMessage } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";

export type BaselineState = { ok?: string; error?: string; at?: number } | undefined;

/** はじめの残高（「この日の時点で残り◯日」）を入れる。空で保存すると消す（入社日からの自動計算に戻る）。総務・経理の担当だけ */
export async function saveBaseline(staffId: string, _prev: BaselineState, form: FormData): Promise<BaselineState> {
  const me = await requireAdmin();
  if (!hasDuty(me, "soumu", "keiri_input", "keiri_approve")) return { error: noDutyMessage("soumu"), at: Date.now() };
  const asOf = String(form.get("as_of") ?? "");
  const raw = String(form.get("remaining") ?? "").trim();
  const admin = createAdminClient();
  if (!raw) {
    await admin.from("paid_leave_baselines").delete().eq("staff_id", staffId);
    await audit({ actor: me.id, action: "delete", targetType: "paid_leave_baseline", targetId: staffId, subject: staffId });
    revalidatePath("/admin/leave");
    return { ok: "はじめの残高を消しました（入社日からの自動計算に戻ります）", at: Date.now() };
  }
  const remaining = Number(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { error: "日付を入れてください", at: Date.now() };
  if (!Number.isFinite(remaining) || remaining < 0 || remaining > 60 || Math.round(remaining * 2) !== remaining * 2) return { error: "日数は0〜60（0.5日単位）で入れてください", at: Date.now() };
  const { error } = await admin
    .from("paid_leave_baselines")
    .upsert({ staff_id: staffId, as_of: asOf, remaining, note: String(form.get("note") ?? "").slice(0, 200) || null, set_by: me.id, set_at: new Date().toISOString() });
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "paid_leave_baseline", targetId: staffId, subject: staffId, detail: { asOf, remaining } });
  revalidatePath("/admin/leave");
  return { ok: "保存しました", at: Date.now() };
}
