import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Header } from "./header";

const ADMIN_MENU = [
  { href: "/admin/login-status", title: "ログイン状況", note: "新システムへの移行状況・最終ログイン" },
];

export default async function Home() {
  const staff = await requireStaff();

  return (
    <>
      <Header staff={staff} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-lg font-semibold">ようこそ、{staff.name} さん</h1>
        {staff.isAdmin && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ADMIN_MENU.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50"
              >
                <div className="font-semibold">{m.title}</div>
                <div className="mt-1 text-sm text-slate-500">{m.note}</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
