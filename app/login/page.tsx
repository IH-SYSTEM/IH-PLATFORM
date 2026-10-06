import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentStaff()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border-[40px] border-white/5" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] rounded-full border-[56px] border-white/5" />
        <p className="relative text-xs font-medium tracking-[0.3em] text-white/50">IKKOU HOLDINGS</p>
        <div className="relative">
          <p className="text-sm font-medium tracking-[0.2em] text-accent">GROUP PORTAL</p>
          <h1 className="mt-4">
            <span className="block whitespace-nowrap text-[clamp(2rem,3.2vw,2.75rem)] font-bold leading-tight tracking-wide">一鴻ホールディングス</span>
            <span className="mt-1 flex items-center gap-3 text-[clamp(1.25rem,2vw,1.625rem)] font-normal tracking-[0.3em] text-white/80">
              <span className="h-px w-8 bg-accent" />
              ポータル
            </span>
          </h1>
          <div className="mt-8 space-y-1 text-sm leading-relaxed text-white/70">
            <p>グループ各社・各店舗の業務を、ひとつの入口から。</p>
            <p>給与明細の確認から店舗運営まで、権限に応じてご利用いただけます。</p>
          </div>
        </div>
        <p className="relative text-xs text-white/40">© IKKOU HOLDINGS Co., Ltd.</p>
      </section>

      <section className="flex flex-col bg-white lg:items-center lg:justify-center lg:px-6 lg:py-12">
        <div className="bg-brand px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-white lg:hidden">
          <p className="text-[11px] font-medium tracking-[0.25em] text-accent">GROUP PORTAL</p>
          <p className="mt-2 whitespace-nowrap text-2xl font-bold leading-snug">一鴻ホールディングス</p>
          <p className="mt-1 flex items-center gap-2.5 text-base tracking-[0.3em] text-white/80">
            <span className="h-px w-6 bg-accent" />
            ポータル
          </p>
        </div>
        <div className="mx-auto -mt-5 w-full max-w-sm rounded-t-xl bg-white px-6 pt-7 lg:mt-0 lg:rounded-none lg:px-0 lg:pt-0">
          <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" width={168} height={42} priority />
          <h2 className="mt-8 text-xl font-bold text-brand">ログイン</h2>
          <p className="mt-1 text-sm text-slate-500">これまでと同じメールアドレスとパスワードでログインできます</p>
          {error === "link" && (
            <p role="alert" className="mt-5 border-l-4 border-accent bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
              リンクの有効期限が切れているか、すでに使用済みです。管理者に再発行を依頼してください。
            </p>
          )}
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
