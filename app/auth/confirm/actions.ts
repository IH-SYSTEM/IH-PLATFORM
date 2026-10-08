"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** メールのリンクを確かめてログインし、パスワード設定画面へ。ボタンを押したときだけ確かめる（LINE・メールアプリの先読みで1回限りのリンクを使い切らないように） */
export async function confirmLink(fd: FormData) {
  const tokenHash = String(fd.get("token_hash") ?? "");
  const type = String(fd.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || type !== "recovery") redirect("/login?error=link");
  const { error } = await (await createClient()).auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/login?error=link");
  redirect("/account/password");
}
