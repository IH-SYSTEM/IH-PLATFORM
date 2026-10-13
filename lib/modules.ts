import "server-only";
import { cache } from "react";
import type { CurrentStaff } from "@/lib/auth";
import { loadOrg } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * モジュール（付けたり外したりできる機能。2026-10-13）。誰が使えるかは「立場」「担当」「個人」のどれかへの割り当てで決まる。
 * 割り当ては［権限付与］の画面（システム担当か代表）で変える。ここはアプリで使う名前の一覧
 */
export type ModuleKey = "workboard";

export const POSITION_LABELS: Record<string, string> = { member: "一般スタッフ", store: "店長", admin: "管理者" };
/** 段での割り当て（その段以上が使える） */
export const RANK_GRANT_LABELS: Record<string, string> = { "2": "正社員以上", "3": "店長・事業責任者以上", "4": "部長・経理主任以上", "5": "社長" };

/** 立場のまとまり。特別管理者は管理者と同じに数える */
const positionOf = (s: CurrentStaff) => (s.permission === "superadmin" ? "admin" : (s.permission ?? "member"));

/** その人が使えるモジュールの一覧（1回の表示の中では1回だけ読む） */
export const myModules = cache(async function myModules(me: CurrentStaff): Promise<Set<ModuleKey>> {
  const [{ data }, org] = await Promise.all([createAdminClient().from("module_grants").select("module, grantee_type, grantee"), loadOrg()]);
  const pos = positionOf(me);
  const level = org.levelOf(me.id);
  const ok = (g: { grantee_type: string; grantee: string }) =>
    (g.grantee_type === "position" && g.grantee === pos) ||
    // 担当は管理者のときだけ効く（担当の決まりと同じ）
    (g.grantee_type === "duty" && me.isAdmin && me.duties.includes(g.grantee as never)) ||
    (g.grantee_type === "staff" && g.grantee === me.id) ||
    // 段：その段以上（組織図の階層）
    (g.grantee_type === "rank" && level >= Number(g.grantee));
  return new Set((data ?? []).filter(ok).map((g) => g.module as ModuleKey));
});

export async function canUse(me: CurrentStaff, key: ModuleKey) {
  return (await myModules(me)).has(key);
}
