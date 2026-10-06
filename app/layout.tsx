import type { Metadata, Viewport } from "next";
import { Montserrat, Noto_Sans_JP, Roboto } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-noto", display: "swap" });
const display = Montserrat({ subsets: ["latin"], weight: ["700", "800"], style: ["italic"], variable: "--font-montserrat", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "IKKOU HOLDINGS ポータル", template: "%s | IKKOU HOLDINGS ポータル" },
  description: "株式会社一鴻ホールディングス グループ従業員向けポータル",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "IKKOUポータル", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#011b4a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`h-full antialiased ${noto.variable} ${roboto.variable} ${display.variable}`}>
      <body className="min-h-full bg-canvas font-sans text-slate-900">{children}</body>
    </html>
  );
}
