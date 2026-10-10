import { notFound } from "next/navigation";
import type { CurrentStaff } from "@/lib/auth";
import type { Announcement } from "@/lib/announcements";
import { AppShell } from "@/app/shell/app-shell";
import { HomeView } from "@/app/home-view";

// 開発中だけ使う、ホームの見た目の確認用（本番では 404）
const a = (
  id: string,
  kind: Announcement["kind"],
  title: string,
  extra: Partial<Announcement> = {},
): Announcement => ({
  id,
  kind,
  title,
  body: null,
  url: null,
  source: null,
  audience: "all",
  audience_ids: [],
  pinned: false,
  published_at: "2026-10-08T01:00:00Z",
  ...extra,
});

export default async function HomePreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const fake: CurrentStaff = {
    id: "preview",
    name: "黒田　学",
    email: null,
    role: "officer",
    permission: "superadmin",
    isAdmin: true,
    lineLinked: true,
    lineFriend: true,
    mustSetPassword: false, duties: [],
  };
  return (
    <AppShell staff={fake}>
      <HomeView
        name={fake.name}
        today="10月8日(木)"
        work={{
          shift: {
            planned_start: "17:00:00",
            planned_end: "23:00:00",
            work_role: "ホール",
          },
          storeName: "郷彩 根っこ",
          punchLabel: "勤務中（16:58〜）",
          working: true,
          todos: [
            {
              label: "シフト希望（10/19〜10/25）を10/18（日）までに出す",
              href: "/shifts/request",
            },
            { label: "未処理の報告が1件あります", href: "/admin/reports" },
          ],
        }}
        notices={[
          a("1", "notice", "年末年始の営業について", {
            pinned: true,
            body: "12/31〜1/3 は全店休業です。",
          }),
          a("2", "notice", "10月の全体ミーティング"),
        ]}
        system={[
          a("3", "system", "画面のデザインを統一しました", {
            body: "パソコンでもスマホでも同じ並びで使えます。",
          }),
        ]}
        news={[
          a("4", "news", "最低賃金、全国平均で過去最大の引き上げ", {
            url: "https://www.nhk.or.jp/",
            source: "NHK",
            body: "アルバイトの時給に関わります",
          }),
        ]}
      />
    </AppShell>
  );
}
