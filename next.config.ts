import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // レジのCSV（1か月分で数MB）を取り込めるように
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
