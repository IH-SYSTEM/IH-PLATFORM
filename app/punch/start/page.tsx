import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { lineAuthorizeUrl, lineConfig } from "@/lib/line-login";
import { openTokenStore } from "@/lib/punch";
import { PunchCard } from "../punch-card";

export const metadata = { title: "打刻" };

const ERRORS: Record<string, { title: string; body: string }> = {
  not_linked: {
    title: "LINE連携がされていません",
    body: "このLINEアカウントは、どのスタッフにも連携されていません。ポータルにメールアドレスでログインし、「アカウント」からLINE連携をしてから、もう一度QRを読み取ってください。",
  },
  token_used: {
    title: "このQRはもう使えません",
    body: "ほかの人が先に読み取ったか、有効期限が切れたQRです。店内の画面に表示されている新しいQRを、もう一度読み取ってください。",
  },
  line_cancelled: { title: "本人確認がキャンセルされました", body: "店内の画面のQRを、もう一度読み取ってください。" },
};

// 打刻QRの読み取り先。QRが使えれば、そのまま LINE の本人確認へ進む
export default async function PunchStartPage({ searchParams }: PageProps<"/punch/start">) {
  const { t, error } = await searchParams;

  if (typeof error === "string") {
    const e = ERRORS[error] ?? { title: "本人確認に失敗しました", body: "店内の画面のQRを、もう一度読み取ってください。" };
    return <PunchCard title={e.title} body={e.body} tone="error" />;
  }

  const token = typeof t === "string" ? t : "";
  const store = await openTokenStore(token);
  if (!store) return <PunchCard title={ERRORS.token_used.title} body={ERRORS.token_used.body} tone="error" />;

  const config = lineConfig();
  if (!config) return <PunchCard title="LINEでの本人確認は準備中です" body="管理者に連絡してください。" tone="error" />;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  redirect(lineAuthorizeUrl(origin, config, "punch", token));
}
