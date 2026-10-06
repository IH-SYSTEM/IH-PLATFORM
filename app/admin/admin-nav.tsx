"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin-nav";

export function AdminNav({ variant }: { variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  const items = ADMIN_NAV.filter((n) => n.ready);

  if (variant === "bar") {
    return (
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium ${
              isActive(n.href) ? "bg-white text-brand" : "bg-white/10 text-white/80"
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
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex items-center border-l-[3px] px-3 py-2 text-sm font-medium transition ${
            isActive(n.href) ? "border-accent bg-white/10 text-white" : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
