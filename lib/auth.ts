import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentStaff = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  permission: string | null;
  isAdmin: boolean;
};

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase
    .from("staff")
    .select("id, name, email, role, permission, retired")
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
  };
}

export async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

export async function requireAdmin() {
  const staff = await requireStaff();
  if (!staff.isAdmin) redirect("/");
  return staff;
}
