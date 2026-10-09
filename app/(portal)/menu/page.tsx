import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Icon } from "@/app/icons";
import { sectionsFor } from "@/app/shell/app-shell";
import { PageHeader } from "@/app/shell/page-header";

import { logout } from "@/app/login/actions";

export const metadata = { title: "メニュー" };

// スマホの「メニュー」。PCのサイドバーと同じ中身を、区分ごとに並べる
export default async function MenuPage() {
  const me = await requireStaff();
  const sections = await sectionsFor(me);
  return (
    <>
      <PageHeader title="メニュー" />
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-xs font-bold tracking-[0.2em] text-slate-400">{s.title}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
              {s.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-800 hover:bg-brand-soft">
                    <Icon name={i.icon} className="size-5 text-brand" />
                    <span className="flex-1">{i.label}</span>
                    <span className="text-slate-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <form action={logout}>
          <button className="w-full rounded-md border border-line bg-white px-4 py-3.5 text-left text-sm font-medium text-accent hover:bg-accent-soft">ログアウト</button>
        </form>
      </div>
    </>
  );
}
