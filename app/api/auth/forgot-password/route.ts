import { NextResponse, type NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

// 会社のメールサーバーは海外からの接続に応じないため、この処理だけ東京で動かす
export const preferredRegion = "hnd1";

/**
 * パスワード再設定メール。1回限りのリンクを作り、会社のメールから送る。
 * 登録の有無が外から分からないよう、結果に関わらず同じ返事をする
 */
export async function POST(request: NextRequest) {
  const { email: raw } = (await request.json().catch(() => ({}))) as { email?: string };
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "メールアドレスを正しく入力してください" }, { status: 400 });

  // 送れない原因を調べるため、サーバーの秘密鍵を知っている人にだけ失敗の理由を返す（一時的）
  const debug = request.headers.get("x-debug-key") === process.env.SUPABASE_SERVICE_ROLE_KEY;
  let failure: string | null = null;
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("name, auth_user_id, retired")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (staff?.auth_user_id && !staff.retired) {
    try {
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
      if (error) throw error;
      const url = new URL("/auth/confirm", request.nextUrl.origin);
      url.searchParams.set("token_hash", data.properties.hashed_token);
      url.searchParams.set("type", "recovery");
      await sendMail({
        to: email,
        subject: "【IKKOU HOLDINGS】パスワードの再設定",
        text: [
          `${staff.name} さん`,
          "",
          "IKKOU HOLDINGS ポータルのパスワード再設定のご案内です。",
          "下のリンクを開き、「新しいパスワードを決める」を押してください（有効期限1時間）。",
          "",
          url.toString(),
          "",
          "このメールに心当たりがない場合は、何もせずに削除してください。",
        ].join("\n"),
      });
    } catch (e) {
      failure = e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e);
      console.error("forgot-password failed", failure);
    }
  }
  return NextResponse.json(debug ? { ok: true, region: process.env.VERCEL_REGION ?? null, failure, passLength: process.env.SMTP_PASS?.length ?? 0 } : { ok: true });
}
