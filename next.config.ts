import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // レジのCSV（1か月分で数MB）を取り込めるように
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // 証明書のPDFに使う日本語フォント（報告の受付で「承認して発行する」を押したときに読む）
  // リール作成：動画の書き出しに使う ffmpeg と、テロップの日本語フォント
  outputFileTracingIncludes: { "/admin/reports": ["./assets/fonts/*.ttf"], "/reels": ["./assets/fonts/*.ttf", "./node_modules/ffmpeg-static/ffmpeg"] },
  serverExternalPackages: ["ffmpeg-static"],
  // 移した画面の前のアドレス（ブックマークや開いたままの画面から来ても迷わないように）
  async redirects() {
    return [
      { source: "/admin/org", destination: "/org", permanent: false },
      // 取引先（銀行）とのデータの受け渡しの入口は /exchange（2026-10-15 /bank から変更）
      { source: "/bank", destination: "/exchange", permanent: false },
      { source: "/bank/:path*", destination: "/exchange/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
