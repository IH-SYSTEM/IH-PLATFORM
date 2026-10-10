"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DUTY_LABELS, canAssign, dutyConflict, type DutyKey } from "@/lib/duties";
import { PERMISSIONS } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type DutyState = { ok?: boolean; error?: string; at?: number } | undefined;

/**
 * 立場（権限）と担当を変える。システム担当か代表だけ。自分のものは変えられない（自分に権限を足せないように）。
 * 担当は管理者以上の人だけが持てる。持てない組み合わせ（経理の入力と承認）は止める
 */
export async function saveRoleAndDuties(staffId: string, _prev: DutyState, fd: FormData): Promise<DutyState> {
  const me = await requireAdmin();
  const fail = (error: string) => ({ error, at: Date.now() });
  if (!canAssign(me)) return fail("立場と担当を変えられるのは「システム」の担当か代表だけです");
  if (staffId === me.id) return fail("自分の立場と担当は変えられません。ほかの担当の人に頼んでください");

  const admin = createAdminClient();
  const { data: target } = await admin.from("staff").select("id, permission, retired").eq("id", staffId).single();
  if (!target) return fail("スタッフが見つかりません");

  const permission = String(fd.get("permission") ?? "member");
  if (!PERMISSIONS.some((p) => p.value === permission)) return fail("立場が正しくありません");
  if ((target.permission === "superadmin" || permission === "superadmin") && target.permission !== permission && me.permission !== "superadmin") {
    return fail("特別管理者の付け外しは、特別管理者だけができます");
  }
  const duties = fd.getAll("duty").map(String).filter((d): d is DutyKey => d in DUTY_LABELS);
  const isAdminRole = permission === "admin" || permission === "superadmin";
  if (duties.length && !isAdminRole) return fail("担当を持てるのは、立場が「管理者」以上の人だけです");
  if (duties.length && target.retired) return fail("退職した人には担当を付けられません");
  const conflict = dutyConflict(duties);
  if (conflict) return fail(conflict);

  const { data: before } = await admin.from("staff_duties").select("duty").eq("staff_id", staffId);
  const prev = new Set((before ?? []).map((d) => d.duty as DutyKey));
  const add = duties.filter((d) => !prev.has(d));
  const remove = [...prev].filter((d) => !duties.includes(d));

  if (permission !== target.permission) {
    const { error } = await admin.from("staff").update({ permission }).eq("id", staffId);
    if (error) return fail("保存に失敗しました");
  }
  if (remove.length) await admin.from("staff_duties").delete().eq("staff_id", staffId).in("duty", remove);
  if (add.length) {
    const { error } = await admin.from("staff_duties").insert(add.map((duty) => ({ staff_id: staffId, duty, granted_by: me.id })));
    if (error) return fail("担当の保存に失敗しました");
  }
  await audit({
    actor: me.id,
    action: "update",
    targetType: "staff_duty",
    targetId: staffId,
    subject: staffId,
    detail: { permission: { from: target.permission, to: permission }, added: add, removed: remove },
  });
  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/staff");
  return { ok: true, at: Date.now() };
}
