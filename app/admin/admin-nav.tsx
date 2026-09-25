"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin-nav";

export function AdminNav({ variant }: { variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  if (variant === "bar") {
    return (
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
        {ADMIN_NAV.filter((n) => n.ready).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${
              isActive(n.href) ? "bg-white text-slate-900" : "bg-white/10 text-slate-200"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-0.5">
      {ADMIN_NAV.map((n) =>
        n.ready ? (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive(n.href) ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        ) : (
          <span key={n.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500">
            {n.label}
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">準備中</span>
          </span>
        ),
      )}
    </nav>
  );
}
