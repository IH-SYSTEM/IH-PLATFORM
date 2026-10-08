import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import type { CurrentStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/attendance";
import { navFor } from "@/lib/nav";
import { permissionLabel } from "@/lib/staff";
import { logout } from "@/app/login/actions";
import { MobileTabBar } from "@/app/mobile-tab-bar";
import { SidebarNav } from "./sidebar-nav";

// 1回の表示の中で何度呼んでも、店長かどうかの確認は1回だけ
const isManagerOf = cache(async (me: CurrentStaff) => (await attendanceScope(me)) !== null);

export async function sectionsFor(me: CurrentStaff) {
  return navFor({ isAdmin: me.isAdmin, isManager: await isManagerOf(me) });
}

/**
 * ログイン後のすべての画面の枠。PCは左のサイドバー、スマホは上のバーと下のタブ。
 * ページごとに枠を作らない（作ると画面ごとに見た目がばらばらになる）
 */
export async function AppShell({ staff, children }: { staff: CurrentStaff; children: React.ReactNode }) {
  const sections = await sectionsFor(staff);
  const initial = staff.name.trim().charAt(0);

  return (
    <div className="min-h-screen bg-canvas lg:flex print:block print:bg-white">
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-brand lg:sticky lg:top-0 lg:flex lg:h-screen">
        <Link href="/" className="block px-5 pb-5 pt-6">
          <Image src="/brand/logo-white.png" alt="IKKOU HOLDINGS" unoptimized width={132} height={33} priority />
          <span className="mt-2 block text-[10px] font-bold tracking-[0.3em] text-white/50">PORTAL</span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <SidebarNav sections={sections} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">{initial}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{staff.name}</p>
            <p className="truncate text-[11px] text-white/50">{permissionLabel(staff.permission)}</p>
          </div>
          <form action={logout}>
            <button className="rounded-sm px-2 py-1 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white">ログアウト</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
          <Link href="/">
            <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={112} height={28} priority />
          </Link>
          <Link href="/account" className="flex items-center gap-2 text-xs text-slate-600">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block font-medium text-slate-900">{staff.name}</span>
              <span className="block text-[11px] text-slate-500">{permissionLabel(staff.permission)}</span>
            </span>
            <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">{initial}</span>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 lg:px-10 lg:pb-12 lg:pt-8 print:p-0">{children}</main>
      </div>

      <MobileTabBar />
    </div>
  );
}
