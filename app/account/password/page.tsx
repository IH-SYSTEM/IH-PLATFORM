import { requireStaff } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  const staff = await requireStaff();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">パスワードの設定</h1>
          <p className="mt-1 text-sm text-slate-500">{staff.name} さん（{staff.email}）</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <PasswordForm />
        </div>
      </div>
    </main>
  );
}
