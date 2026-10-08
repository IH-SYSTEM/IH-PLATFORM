import Image from "next/image";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import { MobileTabBar } from "@/app/mobile-tab-bar";

export const metadata = { title: "パスワード変更" };

export default async function PasswordPage() {
  const staff = await requireStaff({ allowUnlinked: true, allowFirstLogin: true });

  return (
    <main className="flex min-h-screen items-start justify-center px-4 pb-28 pt-10 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードの設定</h1>
        <p className="mt-1 text-sm text-slate-500">
          {staff.name} さん（{staff.email}）
        </p>
        {staff.mustSetPassword && (
          <p className="mt-4 border-l-4 border-accent bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
            いまは本部が決めた仮パスワードです。自分だけのパスワードに変えてから使い始めてください。
          </p>
        )}
        <div className="mt-6 rounded-md border border-line bg-white p-6">
          <PasswordForm />
        </div>
        {!staff.mustSetPassword && (
          <Link href="/account" className="mt-4 inline-block text-sm text-slate-500 hover:text-brand">
            ← アカウントに戻る
          </Link>
        )}
      </div>
      {!staff.mustSetPassword && <MobileTabBar />}
    </main>
  );
}
