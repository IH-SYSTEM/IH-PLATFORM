"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCeo, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConceptState = { ok?: boolean; error?: string; at?: number } | undefined;

async function requireCeo() {
  const me = await requireAdmin();
  if (!isCeo(me)) redirect("/admin");
  return me;
}

/** 柱を足す・直す（id があれば直す） */
export async function saveConcept(id: string | null, _prev: ConceptState, fd: FormData): Promise<ConceptState> {
  const me = await requireCeo();
  const scope = String(fd.get("scope") ?? "").trim().slice(0, 40) || "グループ全体";
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  if (!title || title.length > 100) return { error: "見出しを100文字以内で入れてください", at: Date.now() };
  if (!body || body.length > 4000) return { error: "中身を4000文字以内で入れてください", at: Date.now() };
  const row = { scope, title, body, updated_by: me.id, updated_at: new Date().toISOString() };
  const admin = createAdminClient();
  const { error } = id ? await admin.from("ceo_concepts").update(row).eq("id", id) : await admin.from("ceo_concepts").insert(row);
  if (error) return { error: "保存できませんでした", at: Date.now() };
  await audit({ actor: me.id, action: id ? "update" : "create", targetType: "ceo_concept", targetId: id, detail: { scope, title } });
  revalidatePath("/admin/concepts");
  return { ok: true, at: Date.now() };
}

export async function toggleConcept(id: string, active: boolean) {
  const me = await requireCeo();
  await createAdminClient().from("ceo_concepts").update({ is_active: active, updated_by: me.id }).eq("id", id);
  revalidatePath("/admin/concepts");
}
