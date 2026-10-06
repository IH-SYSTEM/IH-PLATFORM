import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "一鴻ホールディングス ポータル",
    short_name: "IKKOUポータル",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#011b4a",
    icons: [{ src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
