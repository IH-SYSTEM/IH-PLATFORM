import { redirect } from "next/navigation";
import { getPartnerUser } from "@/lib/partner-auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

export default async function BankLoginPage() {
  if (await getPartnerUser()) redirect("/bank");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold text-slate-900">資料閲覧ページ</h1>
      <p className="mt-1 text-sm text-slate-500">株式会社一鴻ホールディングスからお渡ししたIDでログインしてください</p>
      <LoginForm />
    </div>
  );
}
