"use client";

import { usePathname } from "next/navigation";

// 画面ごとに「入力・変更できる担当」。担当がない管理者には、上に「見るだけ」と出す（処理の側でも止めている）
const AREAS: { prefix: string; duties: string[] }[] = [
  { prefix: "/admin/salary-history", duties: [] },
  { prefix: "/admin/salary", duties: ["keiri_input", "keiri_approve"] },
  { prefix: "/admin/imports", duties: ["keiri_input"] },
  { prefix: "/admin/staff", duties: ["soumu", "system"] },
  { prefix: "/admin/companies", duties: ["soumu"] },
  { prefix: "/admin/stores", duties: ["soumu"] },
  { prefix: "/admin/announcements", duties: ["soumu"] },
  { prefix: "/admin/line", duties: ["system"] },
  { prefix: "/attendance/edit", duties: ["soumu"] },
];
const LABELS: Record<string, string> = { keiri_input: "経理（入力）", keiri_approve: "経理（承認）", soumu: "総務", jinji: "人事・教育", system: "システム" };

export function DutyNotice({ duties, isAdmin }: { duties: string[]; isAdmin: boolean }) {
  const pathname = usePathname();
  if (!isAdmin) return null;
  const area = AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  if (!area || !area.duties.length || area.duties.some((d) => duties.includes(d))) return null;
  return (
    <p className="mx-auto mb-4 max-w-6xl rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
      見るだけの画面です。入力・変更は「{area.duties.map((d) => LABELS[d]).join("」か「")}」の担当の人がします
    </p>
  );
}
