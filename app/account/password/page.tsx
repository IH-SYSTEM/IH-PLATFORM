import Image from "next/image";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import { MobileTabBar } from "@/app/mobile-tab-bar";

export const metadata = { title: "パスワード変更" };

export default async function PasswordPage() {
  const staff = await requireStaff();

  return (
    <main className="flex min-h-screen items-start justify-center px-4 pb-28 pt-10 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードの設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          {staff.name} さん（{staff.email}）
        </p>
        <div className="mt-6 rounded-md border border-line bg-white p-6">
          <PasswordForm />
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-500 hover:text-brand">
          ← ポータルに戻る
        </Link>
      </div>
      <MobileTabBar />
    </main>
  );
}
