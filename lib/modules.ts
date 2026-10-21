import "server-only";
import { cache } from "react";
import type { CurrentStaff } from "@/lib/auth";
import { loadOrg, VIEW_LEVEL } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * モジュール（付けたり外したりできる機能。2026-10-13）。誰が使えるかは「立場」「担当」「個人」のどれかへの割り当てで決まる。
 * 割り当ては［権限付与］の画面（システム担当か代表）で変える。ここはアプリで使う名前の一覧
 */
export type ModuleKey = "workboard";

export const POSITION_LABELS: Record<string, string> = { member: "一般スタッフ", store: "店長", admin: "管理者" };
/** 段での割り当て（その段以上が使える） */
export const RANK_GRANT_LABELS: Record<string, string> = { "2": "正社員以上", "3": "店長・事業責任者以上", "4": "部長・経理主任以上", "5": "社長" };

type Grant = { module: string; grantee_type: string; grantee: string };
type Person = { id: string; permission: string | null; duties: string[] };
export type ModuleState = { on: boolean; auto: boolean; autoReason: string | null; override: boolean | null };

/** 立場のまとまり。特別管理者は管理者と同じに数える */
const positionOf = (permission: string | null) => (permission === "superadmin" ? "admin" : (permission ?? "member"));
const isAdminPos = (permission: string | null) => permission === "admin" || permission === "superadmin";

/** 自動で付く理由（階層・立場・担当の「はじめの設定」）。付かなければ null */
function autoReason(grants: Grant[], module: string, p: Person, level: number): string | null {
  for (const g of grants.filter((x) => x.module === module)) {
    if (g.grantee_type === "rank" && level >= Number(g.grantee)) return `階層：${RANK_GRANT_LABELS[g.grantee] ?? g.grantee}`;
    if (g.grantee_type === "position" && g.grantee === positionOf(p.permission)) return `立場：${POSITION_LABELS[g.grantee] ?? g.grantee}`;
    // 担当は管理者のときだけ効く（担当の決まりと同じ）
    if (g.grantee_type === "duty" && isAdminPos(p.permission) && p.duties.includes(g.grantee)) return "担当";
  }
  return null;
}

/** ある人の、機能ごとの状態（自動で付くか・人ごとの設定・最終的に使えるか） */
export async function moduleStatesFor(p: Person, levelOverride?: number): Promise<Record<string, ModuleState>> {
  const admin = createAdminClient();
  const [{ data: modules }, { data: grants }, { data: overrides }, org] = await Promise.all([
    admin.from("modules").select("key"),
    admin.from("module_grants").select("module, grantee_type, grantee"),
    admin.from("staff_module_overrides").select("module, allowed").eq("staff_id", p.id),
    loadOrg(),
  ]);
  const level = levelOverride ?? org.levelOf(p.id);
  return Object.fromEntries(
    (modules ?? []).map((m) => {
      const reason = autoReason(grants ?? [], m.key, p, level);
      const ov = (overrides ?? []).find((o) => o.module === m.key)?.allowed ?? null;
      return [m.key, { on: ov ?? !!reason, auto: !!reason, autoReason: reason, override: ov }];
    }),
  );
}

/** その人が使えるモジュールの一覧（1回の表示の中では1回だけ読む）。人ごとの設定があればそれを優先 */
export const myModules = cache(async function myModules(me: CurrentStaff): Promise<Set<ModuleKey>> {
  // 代表の表示の切り替え中は、切り替えた立場の段で決める（人ごとの設定は使わない）
  const states = await moduleStatesFor({ id: me.viewAs ? `view:${me.viewAs}` : me.id, permission: me.permission, duties: me.duties }, me.viewAs ? VIEW_LEVEL[me.viewAs] : undefined);
  return new Set(Object.entries(states).filter(([, v]) => v.on).map(([k]) => k as ModuleKey));
});

export async function canUse(me: CurrentStaff, key: ModuleKey) {
  return (await myModules(me)).has(key);
}
