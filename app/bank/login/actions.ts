"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { finishPartnerLogin, startPartnerLogin } from "@/lib/partner-auth";

export type LoginState = { step: "password" | "code"; email?: string; error?: string } | undefined;
const PENDING = "ih_partner_pending"; // パスワードが合った人（確認コード待ち）。10分

/** ① パスワード → メールに確認コード ／ ② 確認コード → ログイン */
export async function partnerLogin(prev: LoginState, fd: FormData): Promise<LoginState> {
  const jar = await cookies();
  if (fd.get("step") === "code") {
    const userId = jar.get(PENDING)?.value;
    if (!userId) return { step: "password", error: "時間が過ぎました。最初からやり直してください" };
    const r = await finishPartnerLogin(userId, String(fd.get("code") ?? ""));
    if ("error" in r) return { step: "code", email: prev?.email, error: r.error };
    jar.delete({ name: PENDING, path: "/bank" });
    redirect("/bank");
  }
  const email = String(fd.get("email") ?? "");
  const r = await startPartnerLogin(email, String(fd.get("password") ?? ""));
  if ("error" in r) return { step: "password", error: r.error };
  jar.set(PENDING, r.userId, { httpOnly: true, secure: true, sameSite: "lax", path: "/bank", maxAge: 600 });
  return { step: "code", email: r.email };
}
