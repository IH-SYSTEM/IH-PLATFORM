import type { CurrentStaff } from "@/lib/auth";

export type AppIcon = "payslip" | "key" | "yen" | "users" | "book" | "history" | "store" | "login" | "chart" | "clock" | "crm";

export type PortalApp = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: AppIcon;
  section: "mine" | "payroll" | "organization" | "insight";
  audience: "all" | "manager" | "admin";  // manager … 管理者と店長
  ready: boolean;
};

export const SECTIONS: Record<PortalApp["section"], string> = {
  mine: "わたしのサービス",
  payroll: "給与・労務",
  organization: "組織・店舗",
  insight: "分析・運用",
};

export const APPS: PortalApp[] = [
  { id: "payslip", title: "給与明細", description: "確定した給与明細の確認・印刷", href: "/me", icon: "payslip", section: "mine", audience: "all", ready: true },
  { id: "shift-request", title: "シフト", description: "シフト希望の提出と、確定したシフトの確認", href: "/shifts/request", icon: "clock", section: "mine", audience: "all", ready: true },
  { id: "reports", title: "報告窓口", description: "携帯忘れの打刻など、本部への報告", href: "/reports", icon: "book", section: "mine", audience: "all", ready: true },
  { id: "account", title: "アカウント", description: "パスワード変更・LINEでログインの設定", href: "/account", icon: "key", section: "mine", audience: "all", ready: true },
  { id: "report-inbox", title: "報告の受付", description: "現場からの報告の確認・承認", href: "/admin/reports", icon: "history", section: "payroll", audience: "admin", ready: true },
  { id: "salary", title: "給与入力", description: "勤怠・支給・控除の入力と確定", href: "/admin/salary", icon: "yen", section: "payroll", audience: "admin", ready: true },
  { id: "salary-history", title: "給与履歴出力", description: "確定済み明細の月別・年間出力", href: "/admin/salary-history", icon: "history", section: "payroll", audience: "admin", ready: true },
  { id: "roster", title: "労働者名簿", description: "法定名簿のA4出力", href: "/admin/roster", icon: "book", section: "payroll", audience: "admin", ready: true },
  { id: "shifts", title: "シフト確定", description: "希望を見ながらシフトを組み、週・月ごとに確定", href: "/shifts", icon: "clock", section: "payroll", audience: "manager", ready: true },
  { id: "attendance", title: "勤怠", description: "スタッフ別・日別の出退勤と勤務時間、CSV出力", href: "/attendance", icon: "clock", section: "payroll", audience: "manager", ready: true },
  { id: "staff", title: "スタッフ管理", description: "登録・編集・給与マスタ", href: "/admin/staff", icon: "users", section: "organization", audience: "admin", ready: true },
  { id: "stores", title: "店舗・部署マスタ", description: "所属先の店舗・部署の管理", href: "/admin/stores", icon: "store", section: "organization", audience: "admin", ready: true },
  { id: "login-status", title: "ログイン状況", description: "新システムへの移行と最終ログイン", href: "/admin/login-status", icon: "login", section: "organization", audience: "admin", ready: true },
  { id: "dashboard", title: "経営ダッシュボード", description: "在籍・給与・人件費の推移", href: "/admin", icon: "chart", section: "insight", audience: "admin", ready: true },
  { id: "sales", title: "売上の一元管理", description: "各店舗の売上・生産性の可視化", href: "#", icon: "crm", section: "insight", audience: "admin", ready: false },
];

export function appsFor(staff: CurrentStaff, isManager = false) {
  return APPS.filter((a) => a.audience === "all" || staff.isAdmin || (a.audience === "manager" && isManager));
}
