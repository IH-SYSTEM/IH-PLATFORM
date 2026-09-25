import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await requireAdmin();

  const account = (
    <div className="flex items-center gap-2">
      <Link href="/me" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white">
        マイページ
      </Link>
      <form action={logout}>
        <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white">
          ログアウト
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 px-3 py-5 lg:flex lg:min-h-screen">
        <Link href="/admin" className="mb-8 px-3">
          <span className="block text-sm font-bold tracking-wide text-white">IKKOU HOLDING SYSTEM</span>
          <span className="mt-1 inline-block rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-300">
            ADMIN
          </span>
        </Link>
        <AdminNav variant="sidebar" />
        <div className="mt-auto border-t border-white/10 px-3 pt-4">
          <p className="truncate text-sm font-medium text-white">{me.name}</p>
          <p className="truncate text-xs text-slate-400">{me.email}</p>
          <div className="-mx-2.5 mt-2">{account}</div>
        </div>
      </aside>

      <header className="bg-slate-900 px-4 pt-3 lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">IKKOU</span>
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">ADMIN</span>
          </Link>
          {account}
        </div>
        <AdminNav variant="bar" />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
