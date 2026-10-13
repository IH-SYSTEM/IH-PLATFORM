"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DUTY_LABELS, canAssign } from "@/lib/duties";
import { POSITION_LABELS, RANK_GRANT_LABELS } from "@/lib/modules";
import { createAdminClient } from "@/lib/supabase/admin";

export type GrantState = { ok?: string; error?: string; at?: number } | undefined;

/** 1つのモジュールの割り当て（立場・担当・個人）を、画面で選んだとおりに置き換える。システム担当か代表だけ */
export async function saveModuleGrants(moduleKey: string, _prev: GrantState, fd: FormData): Promise<GrantState> {
  const me = await requireAdmin();
  if (!canAssign(me)) return { error: "割り当てを変えられるのは「システム」の担当か代表だけです", at: Date.now() };
  const admin = createAdminClient();
  const { data: mod } = await admin.from("modules").select("key").eq("key", moduleKey).maybeSingle();
  if (!mod) return { error: "機能が見つかりません", at: Date.now() };

  const positions = fd.getAll("position").map(String).filter((p) => p in POSITION_LABELS);
  const ranks = fd.getAll("rank").map(String).filter((r) => r in RANK_GRANT_LABELS);
  const duties = fd.getAll("duty").map(String).filter((d) => d in DUTY_LABELS);
  const people = fd.getAll("staff").map(String);
  const { data: valid } = people.length ? await admin.from("staff").select("id").in("id", people).eq("retired", false) : { data: [] };
  const next = [
    ...ranks.map((g) => ({ grantee_type: "rank", grantee: g })),
    ...positions.map((g) => ({ grantee_type: "position", grantee: g })),
    ...duties.map((g) => ({ grantee_type: "duty", grantee: g })),
    ...(valid ?? []).map((s) => ({ grantee_type: "staff", grantee: s.id })),
  ];

  const { data: before } = await admin.from("module_grants").select("grantee_type, grantee").eq("module", moduleKey);
  const key = (g: { grantee_type: string; grantee: string }) => `${g.grantee_type}:${g.grantee}`;
  const was = new Set((before ?? []).map(key));
  const now = new Set(next.map(key));
  const removed = (before ?? []).filter((g) => !now.has(key(g)));
  const added = next.filter((g) => !was.has(key(g)));
  for (const g of removed) await admin.from("module_grants").delete().eq("module", moduleKey).eq("grantee_type", g.grantee_type).eq("grantee", g.grantee);
  if (added.length) {
    const { error } = await admin.from("module_grants").insert(added.map((g) => ({ module: moduleKey, ...g, granted_by: me.id })));
    if (error) return { error: "保存できませんでした", at: Date.now() };
  }
  await audit({ actor: me.id, action: "update", targetType: "module_grant", targetId: moduleKey, detail: { added: added.map(key), removed: removed.map(key) } });
  revalidatePath("/admin/permissions");
  revalidatePath("/", "layout");
  return { ok: "保存しました", at: Date.now() };
}
