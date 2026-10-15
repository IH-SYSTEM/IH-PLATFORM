import type { Metadata } from "next";
import { DisplayBoard } from "./display-board";

// 「ホーム画面に追加」したアイコンから、この店の打刻画面がそのまま開くように、専用の設定（manifest）を指す
export async function generateMetadata({ params, searchParams }: PageProps<"/punch/display/[code]">): Promise<Metadata> {
  const { code } = await params;
  const { key } = await searchParams;
  const k = typeof key === "string" ? key : "";
  return {
    title: "打刻QR",
    manifest: `/punch/display/${code}/manifest.webmanifest?key=${encodeURIComponent(k)}`,
    appleWebApp: { capable: true, title: `打刻 ${code}`, statusBarStyle: "black-translucent" },
  };
}

// 店舗の iPad に出しっぱなしにするページ。ログイン不要で、URL の掲示キーで保護する
export default async function PunchDisplayPage({ params, searchParams }: PageProps<"/punch/display/[code]">) {
  const { code } = await params;
  const { key } = await searchParams;
  return <DisplayBoard code={code} displayKey={typeof key === "string" ? key : ""} />;
}
