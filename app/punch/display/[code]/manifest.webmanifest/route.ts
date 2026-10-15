import type { NextRequest } from "next/server";
import { storeForDisplay } from "@/lib/punch";

// 打刻画面（店のiPad・スマホ）を「ホーム画面に追加」したときの設定。追加したアイコンから、ポータルではなくこの店の打刻画面が開くようにする。
// 掲示キーが合わなければ出さない
export async function GET(request: NextRequest, ctx: RouteContext<"/punch/display/[code]/manifest.webmanifest">) {
  const { code } = await ctx.params;
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const store = await storeForDisplay(code, key);
  if (!store) return new Response("not found", { status: 404 });
  const start = `/punch/display/${code}?key=${encodeURIComponent(key)}`;
  return Response.json(
    {
      id: start,
      name: `打刻 ${store.name}`,
      short_name: `打刻 ${store.name}`.slice(0, 12),
      start_url: start,
      scope: `/punch/display/${code}`,
      display: "standalone",
      background_color: "#011b4a",
      theme_color: "#011b4a",
      icons: [{ src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
