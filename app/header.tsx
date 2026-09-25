import Link from "next/link";
import { logout } from "@/app/login/actions";
import type { CurrentStaff } from "@/lib/auth";

export function Header({ staff }: { staff: CurrentStaff }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-bold tracking-wide text-slate-900">
          IKKOU HOLDING SYSTEM
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{staff.name}</span>
          <form action={logout}>
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:border-red-400 hover:text-red-600">
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
