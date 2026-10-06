import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import type { CurrentStaff } from "@/lib/auth";
import { permissionLabel } from "@/lib/staff";

export function PortalHeader({ staff }: { staff: CurrentStaff }) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={112} height={28} priority />
          <span className="hidden border-l border-line pl-3 text-xs font-bold tracking-[0.2em] text-brand sm:inline">PORTAL</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <div className="hidden text-right leading-tight sm:block">
            <p className="font-medium text-slate-900">{staff.name}</p>
            <p className="text-[11px] text-slate-500">{permissionLabel(staff.permission)}</p>
          </div>
          <form action={logout}>
            <button className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-accent hover:text-accent">
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
