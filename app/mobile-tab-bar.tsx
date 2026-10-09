"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

// スマホの下のバー。ホームを真ん中に、左にメニュー・報告、右にシフト・明細
const TABS = [
  { href: "/menu", label: "メニュー", icon: "menu" as const, match: (p: string) => p.startsWith("/menu") },
  { href: "/reports", label: "報告", icon: "history" as const, match: (p: string) => p.startsWith("/reports") },
  { href: "/", label: "ホーム", icon: "home" as const, match: (p: string) => p === "/" },
  { href: "/shifts/mine", label: "シフト", icon: "clock" as const, match: (p: string) => p.startsWith("/shifts/mine") || p.startsWith("/shifts/request") || p.startsWith("/shifts/urgent") },
  { href: "/me", label: "明細", icon: "payslip" as const, match: (p: string) => p === "/me" || p.startsWith("/me/salary") },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-brand" : "text-slate-400"}`}
            >
              {active && <span className="absolute inset-x-5 top-0 h-0.5 bg-accent" />}
              <Icon name={t.icon} className="size-6" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
