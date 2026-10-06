import { NextResponse, type NextRequest } from "next/server";
import { lineConfig, signState } from "@/lib/line-login";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const back = mode === "link" ? "/account" : "/login";
  const config = lineConfig();
  if (!config) return NextResponse.redirect(new URL(`${back}?error=config_error`, request.url));

  // 連携時はクエリの uid を信用せず、今のセッションから本人を特定する
  let uid = "-";
  if (mode === "link") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims.sub) return NextResponse.redirect(new URL("/login?error=not_logged_in", request.url));
    uid = data.claims.sub;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.channelId,
    redirect_uri: new URL("/api/auth/line-callback", request.url).toString(),
    state: signState(config.channelSecret, mode, uid),
    scope: "profile",
  });
  return NextResponse.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
}
