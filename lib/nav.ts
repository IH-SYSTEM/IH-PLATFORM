import type { AppIcon } from "@/lib/apps";

// ポータル全体のメニュー。PCのサイドバー・スマホの「メニュー」画面・ホームは、すべてここから作る（1か所で決める）
//   audience … all：全員／manager：店長と管理者／admin：管理者
//   module … モジュール（権限付与で割り当てた人だけに出す。audience より優先）
//   minLevel … 組織図の段がこれ以上の人だけに出す（4＝部長・経理主任以上）
//   duties … この担当のどれかを持つ管理者だけに出す
//   shiftRequest … シフト希望を出す雇用区分（アルバイト・正社員・契約社員）だけに出す
//   paidLeave … 有給の申請の対象（正社員）だけに出す
//   inventory … 棚卸しシステムを使える人だけに出す（本部の経理・総務と代表、オープンした店の店長）
export type NavItem = { href: string; label: string; icon: AppIcon | "home" | "user"; audience: "all" | "manager" | "admin"; module?: string; minLevel?: number; duties?: string[]; shiftRequest?: boolean; paidLeave?: boolean; inventory?: boolean };
export type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    title: "わたし",
    items: [
      { href: "/", label: "ホーム", icon: "home", audience: "all" },
      { href: "/shifts/request", label: "シフト希望", icon: "clock", audience: "all", shiftRequest: true },
      { href: "/shifts/mine", label: "スケジュール", icon: "clock", audience: "all" },
      { href: "/me/leave", label: "有給休暇", icon: "clock", audience: "all", paidLeave: true },
      { href: "/me", label: "給与明細", icon: "payslip", audience: "all" },
      { href: "/me/documents", label: "書類", icon: "book", audience: "all" },
      { href: "/reports", label: "報告窓口", icon: "history", audience: "all" },
      { href: "/expenses", label: "経費のレシート", icon: "yen", audience: "all" },
      { href: "/ai", label: "AI取説", icon: "book", audience: "all" },
      { href: "/account", label: "アカウント", icon: "user", audience: "all" },
    ],
  },
  {
    title: "店舗",
    items: [
      { href: "/workboard", label: "ワークボード", icon: "clock", audience: "all" },
      { href: "/shifts", label: "シフト確定", icon: "clock", audience: "manager" },
      { href: "/attendance", label: "勤怠", icon: "chart", audience: "manager" },
      { href: "/leave/review", label: "有給の承認", icon: "clock", audience: "manager" },
      { href: "/workhub", label: "ワークハブ", icon: "book", audience: "all", module: "workboard" },
    ],
  },
  {
    title: "棚卸しシステム",
    items: [
      { href: "/inventory", label: "棚卸し・原価", icon: "chart", audience: "all", inventory: true },
      { href: "/inventory/slips", label: "納品伝票", icon: "history", audience: "admin", duties: ["keiri_input", "keiri_approve"] },
      { href: "/inventory/items", label: "品目", icon: "book", audience: "all", inventory: true },
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
      { href: "/admin/leave", label: "有給の管理", icon: "clock", audience: "admin", duties: ["soumu", "keiri_input", "keiri_approve"] },
      { href: "/admin/staff", label: "スタッフ管理", icon: "users", audience: "admin" },
      { href: "/admin/expenses", label: "経費", icon: "yen", audience: "admin", duties: ["keiri_input", "keiri_approve"] },
      { href: "/admin/invoices", label: "請求書", icon: "history", audience: "admin", duties: ["keiri_input", "keiri_approve"] },
      { href: "/admin/account-titles", label: "勘定科目", icon: "book", audience: "admin", duties: ["keiri_input", "keiri_approve"] },
      { href: "/admin/vault", label: "データ保管庫", icon: "book", audience: "admin", duties: ["soumu", "keiri_input", "keiri_approve"] },
      { href: "/admin/partners", label: "取引先（銀行）", icon: "key", audience: "admin", duties: ["soumu", "keiri_input", "keiri_approve"] },
      { href: "/admin/companies", label: "会社マスタ", icon: "store", audience: "admin" },
      { href: "/admin/stores", label: "店舗・部署マスタ", icon: "store", audience: "admin" },
      { href: "/admin/login-status", label: "ログイン状況", icon: "login", audience: "admin" },
      { href: "/org", label: "組織図", icon: "users", audience: "admin", minLevel: 4 },
      { href: "/admin/permissions", label: "権限付与", icon: "key", audience: "admin" },
    ],
  },
];

/** その人に見せるメニュー。空になった区分は出さない */
export function navFor(opts: { isAdmin: boolean; isManager: boolean; modules: Set<string>; level: number; duties: string[]; canRequestShift: boolean; paidLeave: boolean; inventory: boolean }): NavSection[] {
  const ok = (i: NavItem) =>
    i.inventory
      ? opts.inventory
      : i.paidLeave
      ? opts.paidLeave
      : i.shiftRequest
      ? opts.canRequestShift
      : i.duties
      ? opts.isAdmin && i.duties.some((d) => opts.duties.includes(d))
      : i.minLevel
        ? opts.level >= i.minLevel
        : i.module
          ? opts.modules.has(i.module)
          : i.audience === "all" || opts.isAdmin || (i.audience === "manager" && opts.isManager);
  return NAV.map((s) => ({ ...s, items: s.items.filter(ok) })).filter((s) => s.items.length);
}

/** いま開いているページに当たるメニュー（いちばん長く一致するもの） */
export function activeHref(pathname: string, sections: NavSection[]) {
  // 急募への応募は、メニューの「シフト希望」の中
  if (pathname.startsWith("/shifts/urgent")) pathname = "/shifts/request";
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  return hrefs.filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0] ?? null;
}
