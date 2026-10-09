import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /punch/display と /api/punch/display は店舗の iPad 用。ログインの代わりに掲示キーで保護する
// /punch/start・/punch/confirm はスタッフのスマホ用。ログインの代わりに LINE の本人確認と署名付きの札で保護する
const PUBLIC_PATHS = [
  "/login",
  "/auth/",
  "/forgot-password",
  "/api/auth/line-",
  "/api/auth/forgot-password",
  "/api/cron/",
  "/manifest.webmanifest",
  "/punch/display/",
  "/api/punch/display/",
  "/punch/start",
  "/punch/confirm",
];

// 引っ越しなどで止めるときの「メンテナンス中」画面（環境変数 MAINTENANCE=1 のときだけ）
const MAINTENANCE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>メンテナンス中 | IKKOU HOLDINGS ポータル</title></head>
<body style="margin:0;font-family:-apple-system,'Hiragino Sans',sans-serif;background:#f6f7f9;color:#011b4a;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:420px;padding:32px;text-align:center"><p style="font-size:13px;letter-spacing:.2em;color:#64748b">IKKOU HOLDINGS ポータル</p>
<h1 style="font-size:22px;margin:12px 0">ただいまメンテナンス中です</h1>
<p style="font-size:14px;line-height:1.8;color:#334155">システムを速くするための作業をしています。終わるまでしばらくお待ちください。<br>打刻ができないときは、作業のあとに報告窓口から「出勤の報告」「退勤の報告」で記録してください。</p></div></body></html>`;

export async function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE === "1") return new NextResponse(MAINTENANCE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1800" } });
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  // 開発中だけ、画面の枠の確認用ページをログインなしで開ける（本番では対象外）
  const isDevPreview = process.env.NODE_ENV === "development" && request.nextUrl.pathname.startsWith("/dev/");
  const isPublic = isDevPreview || PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
