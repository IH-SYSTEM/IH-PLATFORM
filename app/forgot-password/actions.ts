"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ForgotState = { sent?: boolean; error?: string; email?: string } | undefined;

export async function requestReset(_prev: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "メールアドレスを正しく入力してください", email };

  // 登録の有無が外から分からないよう、結果に関わらず同じ表示にする
  const { data: staff } = await createAdminClient()
    .from("staff")
    .select("auth_user_id, retired")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (staff?.auth_user_id && !staff.retired) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) console.error("resetPasswordForEmail failed", error.message);
  }
  return { sent: true, email };
}
