"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentStaff, VIEW_COOKIE, VIEW_LABELS, VIEW_STORE_COOKIE, type ViewMode } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** 表示の切り替え（代表だけ）。mode=null で管理者（いつもの表示）に戻す */
export async function setViewAs(mode: ViewMode | null, storeId: string | null) {
  const me = await getCurrentStaff();
  if (!me?.canViewAs) return;
  const jar = await cookies();
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 };
  if (mode && mode in VIEW_LABELS) {
    jar.set(VIEW_COOKIE, mode, opts);
    if (storeId) jar.set(VIEW_STORE_COOKIE, storeId, opts);
  } else {
    jar.delete(VIEW_COOKIE);
    jar.delete(VIEW_STORE_COOKIE);
  }
  await audit({ actor: me.id, action: "update", targetType: "view_as", detail: { mode, storeId } });
  redirect("/");
}
