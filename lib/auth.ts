import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lineConfig } from "@/lib/line-login";
import type { DutyKey } from "@/lib/duties";

export type CurrentStaff = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  permission: string | null;
  isAdmin: boolean;
  lineLinked: boolean;
  lineFriend: boolean | null;
  mustSetPassword: boolean; // 本部が決めた仮パスワードのまま（最初のログインで本人のパスワードに変えてもらう）
  duties: DutyKey[]; // 担当（入力・承認できる仕事）。管理者のときだけ入る
  // 表示の切り替え（代表だけ。2026-10-21）：アルバイト・正社員・店長の画面を確かめる。切り替え中は、その立場と同じ権限で動く
  canViewAs?: boolean; // 本当は代表（切り替え中でも true）
  viewAs?: ViewMode | null;
  viewStoreId?: string | null; // 店長の表示で見る店
};

export type ViewMode = "parttime" | "fulltime" | "manager";
export const VIEW_LABELS: Record<ViewMode, string> = { parttime: "アルバイト", fulltime: "正社員", manager: "店長" };
export const VIEW_COOKIE = "ih_view_as";
export const VIEW_STORE_COOKIE = "ih_view_store";

/** ログイン中のスタッフ。1回の表示の中では何度呼んでも1回だけ読む（枠と画面の両方で使うため） */
export const getCurrentStaff = cache(async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase
    .from("staff")
    .select("id, name, email, role, permission, retired, line_user_id, line_friend, first_login")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!data || data.retired) return null;
  const isAdmin = data.permission === "admin" || data.permission === "superadmin";
  const { data: duties } = isAdmin ? await supabase.from("staff_duties").select("duty").eq("staff_id", data.id) : { data: [] };
  const ceo = isCeoId(data.id, data.permission);
  if (ceo) {
    const jar = await cookies();
    const mode = jar.get(VIEW_COOKIE)?.value as ViewMode | undefined;
    if (mode && mode in VIEW_LABELS) {
      // 切り替え中：その立場の雇用区分・権限で動かす（管理者の担当は持たない）
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: mode === "parttime" ? "parttime" : "fulltime",
        permission: mode === "manager" ? "store" : "member",
        isAdmin: false,
        lineLinked: Boolean(data.line_user_id),
        lineFriend: data.line_friend,
        mustSetPassword: false,
        duties: [],
        canViewAs: true,
        viewAs: mode,
        viewStoreId: jar.get(VIEW_STORE_COOKIE)?.value ?? null,
      };
    }
  }
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    permission: data.permission,
    // 管理者かどうかは「権限」だけで決める。雇用区分（role）の「管理部」は働き方の区分で、権限ではない
    isAdmin,
    lineLinked: Boolean(data.line_user_id),
    lineFriend: data.line_friend,
    mustSetPassword: data.first_login === true,
    // 代表（社長）は、すべての担当の入力・承認ができる（2026-10-13 黒田さん「普段は触らないが、できるようにはしておきたい」）
    duties: ceo ? ALL_DUTIES : (duties ?? []).map((d) => d.duty as DutyKey),
    canViewAs: ceo,
    viewAs: null,
  };
});

const ALL_DUTIES: DutyKey[] = ["keiri_input", "keiri_approve", "soumu", "jinji", "system"];
const isCeoId = (id: string, permission: string | null) => permission === "superadmin" && !!process.env.CEO_STAFF_ID && id === process.env.CEO_STAFF_ID;

/** LINE連携が済んでいない（API など、画面を移せないところで使う）。例外なく全員に連携を求める（2026-10-08 黒田さん決定） */
// 公式LINEの友だちだと確認できた人（true）だけを通す。確かめられていない人（null）も止め、連携の画面で確かめ直してもらう
export const needsLineLink = (s: CurrentStaff) => (!s.lineLinked || s.lineFriend !== true) && Boolean(lineConfig());

/**
 * ログイン必須。LINE連携が済んでいない人は、例外なく連携の画面へ移す。
 * 連携の画面そのものと、アカウント画面は allowUnlinked で通す。
 * 仮パスワードのままの人は、LINE連携より先にパスワードの設定画面へ移す（allowFirstLogin はその画面だけ）
 */
export async function requireStaff({ allowUnlinked = false, allowFirstLogin = false }: { allowUnlinked?: boolean; allowFirstLogin?: boolean } = {}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!allowFirstLogin && staff.mustSetPassword) redirect("/account/password");
  if (!allowUnlinked && needsLineLink(staff)) redirect("/link-line");
  return staff;
}

export async function requireAdmin() {
  const staff = await requireStaff();
  if (!staff.isAdmin) redirect("/");
  return staff;
}

/**
 * 代表（CEO）本人か。壁打ち・コンセプト帳は代表本人だけが使う（2026-10-10 黒田さん「私にしかないこと」）。
 * 権限が最高管理者でも、本人でなければ使えない。本人は環境変数 CEO_STAFF_ID で決める
 */
export const isCeo = (s: CurrentStaff) => isCeoId(s.id, s.permission);
