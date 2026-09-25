"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFirebasePassword } from "@/lib/firebase-legacy";

export type LoginState = { error?: string; email?: string } | undefined;

const LOGIN_FAILED = "メールアドレスまたはパスワードが正しくありません";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください", email };

  const supabase = await createClient();
  const first = await supabase.auth.signInWithPassword({ email, password });
  if (!first.error) redirect("/");

  // 新システムでパスワード未設定の人だけ、旧 Firebase のパスワードで本人確認して引き継ぐ
  if (await migrateFromFirebase(email, password)) {
    const second = await supabase.auth.signInWithPassword({ email, password });
    if (!second.error) redirect("/");
  }
  return { error: LOGIN_FAILED, email };
}

async function migrateFromFirebase(email: string, password: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("id, auth_user_id, firebase_uid, retired")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (!staff?.auth_user_id || !staff.firebase_uid || staff.retired) return false;

  const { data: passwordSet } = await admin.rpc("auth_password_set", { p_user_id: staff.auth_user_id });
  if (passwordSet !== false) return false;

  const firebaseUid = await verifyFirebasePassword(email, password);
  if (firebaseUid !== staff.firebase_uid) return false;

  const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, { password });
  return !error;
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
