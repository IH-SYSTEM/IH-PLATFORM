"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PasswordState = { error?: string } | undefined;

export async function updatePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "パスワードは8文字以上にしてください" };
  if (password !== confirm) return { error: "確認用のパスワードが一致しません" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.code === "same_password" ? "現在と同じパスワードは使えません" : "パスワードを変更できませんでした。もう一度お試しください",
    };
  }
  await createAdminClient()
    .from("staff")
    .update({ first_login: false, password_set_at: new Date().toISOString() })
    .eq("auth_user_id", userId);
  redirect("/");
}
