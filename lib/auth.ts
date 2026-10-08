import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lineConfig } from "@/lib/line-login";

export type CurrentStaff = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  permission: string | null;
  isAdmin: boolean;
  lineLinked: boolean;
  lineFriend: boolean | null;
};

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase
    .from("staff")
    .select("id, name, email, role, permission, retired, line_user_id, line_friend")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!data || data.retired) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    permission: data.permission,
    isAdmin: data.permission === "admin" || data.permission === "superadmin" || data.role === "admin",
    lineLinked: Boolean(data.line_user_id),
    lineFriend: data.line_friend,
  };
}

/** LINE連携が済んでいない（API など、画面を移せないところで使う）。例外なく全員に連携を求める（2026-10-08 黒田さん決定） */
// 公式LINEの友だちだと確認できた人（true）だけを通す。確かめられていない人（null）も止め、連携の画面で確かめ直してもらう
export const needsLineLink = (s: CurrentStaff) => (!s.lineLinked || s.lineFriend !== true) && Boolean(lineConfig());

/**
 * ログイン必須。LINE連携が済んでいない人は、例外なく連携の画面へ移す。
 * 連携の画面そのものと、アカウント画面は allowUnlinked で通す
 */
export async function requireStaff({ allowUnlinked = false }: { allowUnlinked?: boolean } = {}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!allowUnlinked && needsLineLink(staff)) redirect("/link-line");
  return staff;
}

export async function requireAdmin() {
  const staff = await requireStaff();
  if (!staff.isAdmin) redirect("/");
  return staff;
}
