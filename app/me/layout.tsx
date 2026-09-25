import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export default async function StaffLayout({ children }: LayoutProps<"/me">) {
  const staff = await requireStaff();

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/me" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">I</span>
            <span className="text-sm font-bold tracking-wide text-stone-800">IKKOU</span>
          </Link>
          <div className="flex items-center gap-2">
            {staff.isAdmin && (
              <Link
                href="/admin"
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                管理画面へ
              </Link>
            )}
            <form action={logout}>
              <button className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
