const yenFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });

export function yen(value: number | string | null | undefined) {
  return `¥${yenFormat.format(Number(value ?? 0))}`;
}

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });

export function jpDate(value: string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export const ROLE_LABELS: Record<string, string> = {
  officer: "役員",
  fulltime: "正社員",
  contract: "契約社員",
  parttime: "パート・アルバイト",
  freelance: "業務委託",
  admin: "管理部",
};

export function roleLabel(role: string | null | undefined) {
  return (role && ROLE_LABELS[role]) || "—";
}
