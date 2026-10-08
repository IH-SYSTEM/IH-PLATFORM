"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/app/icons";
import { activeHref, type NavSection } from "@/lib/nav";

/** PCのサイドバーのメニュー。区分（わたし・店舗・本部）ごとに並べ、今のページを目立たせる */
export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, sections);
  return (
    <nav className="space-y-6">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="px-5 text-[11px] font-bold tracking-[0.2em] text-white/40">{s.title}</p>
          <ul className="mt-2 space-y-0.5">
            {s.items.map((i) => {
              const on = i.href === active;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className={`flex items-center gap-3 border-l-[3px] px-5 py-2 text-sm font-medium transition ${
                      on ? "border-accent bg-white/10 text-white" : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon name={i.icon} className="size-[18px] shrink-0" />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
