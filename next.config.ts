import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // レジのCSV（1か月分で数MB）を取り込めるように
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // 証明書のPDFに使う日本語フォント（報告の受付で「承認して発行する」を押したときに読む）
  outputFileTracingIncludes: { "/admin/reports": ["./assets/fonts/*.ttf"] },
};

export default nextConfig;
