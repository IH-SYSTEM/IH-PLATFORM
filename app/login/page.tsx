import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentStaff()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-wide text-slate-900">IKKOU HOLDING SYSTEM</h1>
          <p className="mt-1 text-sm text-slate-500">これまでと同じメールアドレスとパスワードでログインできます</p>
        </div>
        {error === "link" && (
          <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            リンクの有効期限が切れているか、すでに使用済みです。管理者に再発行を依頼してください。
          </p>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
