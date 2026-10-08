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
  "/manifest.webmanifest",
  "/punch/display/",
  "/api/punch/display/",
  "/punch/start",
  "/punch/confirm",
];

export async function proxy(request: NextRequest) {
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
