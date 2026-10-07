import { DisplayBoard } from "./display-board";

export const metadata = { title: "打刻QR" };

// 店舗の iPad に出しっぱなしにするページ。ログイン不要で、URL の掲示キーで保護する
export default async function PunchDisplayPage({ params, searchParams }: PageProps<"/punch/display/[code]">) {
  const { code } = await params;
  const { key } = await searchParams;
  return <DisplayBoard code={code} displayKey={typeof key === "string" ? key : ""} />;
}
