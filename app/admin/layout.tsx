import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { AdminNav } from "./admin-nav";

export const metadata = { title: { default: "管理", template: "%s | 管理 | 一鴻ホールディングス ポータル" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await requireAdmin();

  const logoutButton = (
    <form action={logout}>
      <button className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white">ログアウト</button>
    </form>
  );

  return (
    <div className="min-h-screen bg-canvas lg:flex print:block print:bg-white">
      <aside className="no-print hidden w-60 shrink-0 flex-col bg-brand py-5 lg:flex lg:min-h-screen">
        <Link href="/" className="mb-6 block px-5">
          <span className="block text-[11px] font-medium tracking-[0.25em] text-white/50">IKKOU HOLDINGS</span>
          <span className="mt-1 flex items-center gap-2 text-sm font-bold text-white">
            PORTAL
            <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wider">ADMIN</span>
          </span>
        </Link>
        <Link href="/" className="mx-3 mb-4 rounded-sm border border-white/15 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white">
          ← ポータルトップ
        </Link>
        <AdminNav variant="sidebar" />
        <div className="mt-auto border-t border-white/10 px-5 pt-4">
          <p className="truncate text-sm font-medium text-white">{me.name}</p>
          <p className="truncate text-xs text-white/50">{me.email}</p>
          <div className="-mx-2.5 mt-2">{logoutButton}</div>
        </div>
      </aside>

      <header className="no-print bg-brand px-4 pt-3 lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-white">
            ← PORTAL
            <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold">ADMIN</span>
          </Link>
          {logoutButton}
        </div>
        <AdminNav variant="bar" />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8 print:p-0">{children}</main>
    </div>
  );
}
