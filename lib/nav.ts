import type { AppIcon } from "@/lib/apps";

// ポータル全体のメニュー。PCのサイドバー・スマホの「メニュー」画面・ホームは、すべてここから作る（1か所で決める）
//   audience … all：全員／manager：店長と管理者／admin：管理者
export type NavItem = { href: string; label: string; icon: AppIcon | "home" | "user"; audience: "all" | "manager" | "admin" };
export type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    title: "わたし",
    items: [
      { href: "/", label: "ホーム", icon: "home", audience: "all" },
      { href: "/shifts/mine", label: "シフト", icon: "clock", audience: "all" },
      { href: "/me", label: "給与明細", icon: "payslip", audience: "all" },
      { href: "/me/documents", label: "書類", icon: "book", audience: "all" },
      { href: "/reports", label: "報告窓口", icon: "history", audience: "all" },
      { href: "/ai", label: "AI取説", icon: "book", audience: "all" },
      { href: "/account", label: "アカウント", icon: "user", audience: "all" },
    ],
  },
  {
    title: "店舗",
    items: [
      { href: "/shifts", label: "シフト確定", icon: "clock", audience: "manager" },
      { href: "/attendance", label: "勤怠", icon: "chart", audience: "manager" },
    ],
  },
  {
    title: "本部",
    items: [
      { href: "/admin", label: "ダッシュボード", icon: "chart", audience: "admin" },
      { href: "/admin/sales", label: "売上", icon: "yen", audience: "admin" },
      { href: "/admin/imports", label: "データ取り込み", icon: "history", audience: "admin" },
      { href: "/admin/reports", label: "報告の受付", icon: "history", audience: "admin" },
      { href: "/admin/announcements", label: "お知らせ", icon: "book", audience: "admin" },
      { href: "/admin/line", label: "LINE配信", icon: "history", audience: "admin" },
      { href: "/admin/ai-logs", label: "AI取説の記録", icon: "chart", audience: "admin" },
      { href: "/admin/salary", label: "給与入力", icon: "yen", audience: "admin" },
      { href: "/admin/salary-history", label: "給与履歴出力", icon: "history", audience: "admin" },
      { href: "/admin/roster", label: "労働者名簿", icon: "book", audience: "admin" },
      { href: "/admin/staff", label: "スタッフ管理", icon: "users", audience: "admin" },
      { href: "/admin/companies", label: "会社マスタ", icon: "store", audience: "admin" },
      { href: "/admin/stores", label: "店舗・部署マスタ", icon: "store", audience: "admin" },
      { href: "/admin/login-status", label: "ログイン状況", icon: "login", audience: "admin" },
    ],
  },
];

/** その人に見せるメニュー。空になった区分は出さない */
export function navFor(opts: { isAdmin: boolean; isManager: boolean }): NavSection[] {
  const ok = (a: NavItem["audience"]) => a === "all" || opts.isAdmin || (a === "manager" && opts.isManager);
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => ok(i.audience)) })).filter((s) => s.items.length);
}

/** いま開いているページに当たるメニュー（いちばん長く一致するもの） */
export function activeHref(pathname: string, sections: NavSection[]) {
  // シフト希望・急募は、メニューの「シフト」（確定スケジュールとタブで切り替え）の中
  if (pathname.startsWith("/shifts/request") || pathname.startsWith("/shifts/urgent")) pathname = "/shifts/mine";
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  return hrefs.filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0] ?? null;
}
