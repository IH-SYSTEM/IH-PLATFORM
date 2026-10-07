import { NextResponse, type NextRequest } from "next/server";
import { friendshipStatus, lineConfig, verifyState } from "@/lib/line-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimToken, signTicket } from "@/lib/punch";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const fail = (path: string, code: string) => NextResponse.redirect(new URL(`${path}?error=${code}`, request.url));

  const config = lineConfig();
  if (!config) return fail("/login", "config_error");
  const verified = verifyState(config.channelSecret, q.get("state") ?? "");
  const back = verified?.mode === "link" ? "/link-line" : verified?.mode === "punch" ? "/punch/start" : "/login";
  if (q.get("error")) return fail(back, "line_cancelled");
  const code = q.get("code");
  if (!code) return fail(back, "invalid_request");
  if (!verified) return fail("/login", "invalid_state");

  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: new URL("/api/auth/line-callback", request.url).toString(),
      client_id: config.channelId,
      client_secret: config.channelSecret,
    }),
  });
  if (!tokenRes.ok) return fail(back, "token_failed");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const profileRes = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!profileRes.ok) return fail(back, "profile_failed");
  const { userId } = (await profileRes.json()) as { userId?: string };
  if (!userId) return fail(back, "profile_failed");

  const admin = createAdminClient();
  // 公式LINEの友だちかどうかを、ログイン・連携のたびに記録し直す（打刻のときは確かめない）
  const recordFriendship = async () => {
    const friend = await friendshipStatus(access_token!);
    await admin.from("staff").update({ line_friend: friend, line_friend_checked_at: new Date().toISOString() }).eq("line_user_id", userId);
  };

  // 打刻：LINE の本人とQRのトークンを結びつけ、確認画面（出勤・退勤ボタン）へ
  if (verified.mode === "punch") {
    const { data: staff } = await admin.from("staff").select("id, retired").eq("line_user_id", userId).maybeSingle();
    if (!staff || staff.retired) return fail("/punch/start", "not_linked");
    if (!(await claimToken(verified.uid, staff.id))) return fail("/punch/start", "token_used");
    const confirm = new URL("/punch/confirm", request.url);
    confirm.searchParams.set("ticket", signTicket(verified.uid, staff.id));
    return NextResponse.redirect(confirm);
  }

  if (verified.mode === "link") {
    const { data: other } = await admin.from("staff").select("id").eq("line_user_id", userId).neq("auth_user_id", verified.uid).maybeSingle();
    if (other) return fail("/link-line", "already_used");
    const { error } = await admin
      .from("staff")
      .update({ line_user_id: userId, line_connected_at: new Date().toISOString() })
      .eq("auth_user_id", verified.uid);
    if (error) return fail("/link-line", "session_failed");
    await recordFriendship();
    return NextResponse.redirect(new URL("/?line=linked", request.url));
  }

  const { data: staff } = await admin.from("staff").select("email, retired, auth_user_id").eq("line_user_id", userId).maybeSingle();
  if (!staff?.email || !staff.auth_user_id || staff.retired) return fail("/login", "not_linked");
  await recordFriendship();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: staff.email });
  if (error || !link) return fail("/login", "session_failed");

  const confirm = new URL("/auth/confirm", request.url);
  confirm.searchParams.set("token_hash", link.properties.hashed_token);
  confirm.searchParams.set("type", "magiclink");
  confirm.searchParams.set("next", "/");
  return NextResponse.redirect(confirm);
}
