// ポータルの「ホーム画面に追加」の設定。打刻画面（店のiPad）は別の設定を使うので、
// ファイルの決まり（app/manifest.ts）ではなく、ここで出して各ページから指す（2026-10-15）
export function GET() {
  return Response.json(
    {
      name: "IKKOU HOLDINGS ポータル",
      short_name: "IKKOUポータル",
      start_url: "/",
      display: "standalone",
      background_color: "#f4f6f9",
      theme_color: "#011b4a",
      icons: [{ src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
