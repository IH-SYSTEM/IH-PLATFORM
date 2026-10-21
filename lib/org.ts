import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 組織図と階層（2026-10-13 黒田さん決定）。
 *   段：5 社長 ＞ 4 部長・経理主任 ＞ 3 店長・事業責任者 ＞ 2 正社員 ＞ 1 アルバイト
 *   社長・部長・経理主任は手で付ける（グループ全体が配下）。責任者は組織図の各事業・店に付ける（その事業・店が配下）。
 *   それ以外は雇用区分で決まる（正社員・契約社員・役員・管理部＝正社員の段、パート・アルバイト・業務委託＝アルバイトの段）。
 *   雇用区分（給与）・立場と担当（権限）とは別に持つ
 * お知らせなどを出せる相手：自分より下の段で、自分の配下（自分の店・事業、責任者なら担当の店・事業、上の役職なら全社）の人
 */
export const LEVEL_LABELS: Record<number, string> = { 5: "社長", 4: "部長・経理主任", 3: "店長・事業責任者", 2: "正社員", 1: "アルバイト" };
const TITLE_LEVEL: Record<string, number> = { 社長: 5, 部長: 4, 経理主任: 4 };
const STAFF_LEVEL_ROLES = new Set(["fulltime", "contract", "officer", "admin"]);

export type OrgUnit = { id: string; code: string; name: string; kind: "group" | "company" | "unit"; parent_id: string | null; store_id: string | null; head_staff_ids: string[]; sort_order: number };
type OrgStaff = { id: string; name: string; store_id: string | null; role: string | null; org_title: string | null };

export const loadOrg = cache(async function loadOrg() {
  const admin = createAdminClient();
  const [{ data: units }, { data: staff }, { data: stores }] = await Promise.all([
    admin.from("org_units").select("id, code, name, kind, parent_id, store_id, head_staff_ids, sort_order").order("sort_order").returns<OrgUnit[]>(),
    admin.from("staff").select("id, name, store_id, role, org_title").eq("retired", false).returns<OrgStaff[]>(),
    admin.from("stores").select("id").eq("is_active", true),
  ]);
  const u = units ?? [];
  const byId = new Map(u.map((x) => [x.id, x]));
  const children = (id: string) => u.filter((x) => x.parent_id === id);
  // その組織の下にある店（自分自身を含む）
  const storesUnder = (id: string): string[] => {
    const me = byId.get(id);
    return [...(me?.store_id ? [me.store_id] : []), ...children(id).flatMap((c) => storesUnder(c.id))];
  };
  const allStores = (stores ?? []).map((s) => s.id);
  const staffById = new Map((staff ?? []).map((s) => [s.id, s]));

  const levelOf = (staffId: string): number => {
    const s = staffById.get(staffId);
    if (!s) return 0;
    if (s.org_title && TITLE_LEVEL[s.org_title]) return TITLE_LEVEL[s.org_title];
    if (u.some((x) => x.head_staff_ids.includes(staffId))) return 3;
    return STAFF_LEVEL_ROLES.has(s.role ?? "") ? 2 : 1;
  };

  /** 配下の店（全社なら all） */
  const scopeOf = (staffId: string): { all: boolean; storeIds: string[] } => {
    const s = staffById.get(staffId);
    if (!s) return { all: false, storeIds: [] };
    if (s.org_title && TITLE_LEVEL[s.org_title]) return { all: true, storeIds: allStores };
    const headed = u.filter((x) => x.head_staff_ids.includes(staffId)).flatMap((x) => storesUnder(x.id));
    if (headed.length) return { all: false, storeIds: [...new Set(headed)] };
    return { all: false, storeIds: levelOf(staffId) >= 2 && s.store_id ? [s.store_id] : [] };
  };

  /** その人に出せるか（自分より下の段で、配下にいる） */
  const canReach = (fromId: string, toId: string) => {
    const to = staffById.get(toId);
    if (!to || fromId === toId) return false;
    const scope = scopeOf(fromId);
    return levelOf(toId) < levelOf(fromId) && (scope.all || (!!to.store_id && scope.storeIds.includes(to.store_id)));
  };

  return { units: u, staff: staff ?? [], levelOf, scopeOf, canReach, storesUnder };
});

/** 自分の段。代表の「表示の切り替え」中は、切り替えた立場の段（アルバイト1・正社員2・店長3）で扱う（2026-10-21） */
export const VIEW_LEVEL: Record<string, number> = { parttime: 1, fulltime: 2, manager: 3 };
export async function myLevel(me: { id: string; viewAs?: string | null }) {
  if (me.viewAs) return VIEW_LEVEL[me.viewAs] ?? 1;
  return (await loadOrg()).levelOf(me.id);
}

/** 自分の配下の範囲。切り替え中は、選んだ店だけ（店長）か、なし */
export async function myScope(me: { id: string; viewAs?: string | null; viewStoreId?: string | null }) {
  if (me.viewAs) return me.viewAs === "manager" && me.viewStoreId ? { all: false, storeIds: [me.viewStoreId] } : { all: false, storeIds: [] };
  return (await loadOrg()).scopeOf(me.id);
}
