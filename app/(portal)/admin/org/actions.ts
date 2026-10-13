"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAssign } from "@/lib/duties";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgState = { ok?: string; error?: string; at?: number } | undefined;
const TITLES = ["社長", "部長", "経理主任"];

/** 事業・店の責任者を決める（システム担当か代表） */
export async function saveHeads(unitId: string, _prev: OrgState, fd: FormData): Promise<OrgState> {
  const me = await requireAdmin();
  if (!canAssign(me)) return { error: "組織図を変えられるのは「システム」の担当か代表だけです", at: Date.now() };
  const ids = fd.getAll("head").map(String).filter(Boolean);
  const admin = createAdminClient();
  const { data: valid } = ids.length ? await admin.from("staff").select("id").in("id", ids).eq("retired", false) : { data: [] };
  const heads = (valid ?? []).map((s) => s.id);
  const { error } = await admin.from("org_units").update({ head_staff_ids: heads }).eq("id", unitId);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "org_unit", targetId: unitId, detail: { heads } });
  revalidatePath("/admin/org");
  return { ok: "責任者を保存しました", at: Date.now() };
}

/** グループ全体の役職（社長・部長・経理主任）を付け外しする（システム担当か代表。自分のものは変えられない） */
export async function saveTitle(_prev: OrgState, fd: FormData): Promise<OrgState> {
  const me = await requireAdmin();
  if (!canAssign(me)) return { error: "役職を変えられるのは「システム」の担当か代表だけです", at: Date.now() };
  const staffId = String(fd.get("staff_id") ?? "");
  const title = String(fd.get("title") ?? "") || null;
  if (!staffId) return { error: "人を選んでください", at: Date.now() };
  if (staffId === me.id) return { error: "自分の役職は変えられません", at: Date.now() };
  if (title && !TITLES.includes(title)) return { error: "役職が正しくありません", at: Date.now() };
  const { error } = await createAdminClient().from("staff").update({ org_title: title }).eq("id", staffId);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: "update", targetType: "staff", targetId: staffId, subject: staffId, detail: { org_title: title } });
  revalidatePath("/admin/org");
  return { ok: title ? `「${title}」にしました` : "役職を外しました", at: Date.now() };
}
