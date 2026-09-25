export const ADMIN_NAV = [
  { href: "/admin", label: "ダッシュボード", ready: true },
  { href: "/admin/salary", label: "給与入力", ready: true },
  { href: "/admin/staff", label: "スタッフ管理", ready: true },
  { href: "/admin/roster", label: "労働者名簿", ready: true },
  { href: "/admin/salary-history", label: "給与履歴出力", ready: false },
  { href: "/admin/stores", label: "店舗・部署マスタ", ready: true },
  { href: "/admin/login-status", label: "ログイン状況", ready: true },
] as const;
