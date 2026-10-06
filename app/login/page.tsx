import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { LINE_ERRORS, lineConfig } from "@/lib/line-login";
import { LineMark } from "@/app/line-mark";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentStaff()) redirect("/");
  const { error } = await searchParams;
  const errorMessage =
    error === "link"
      ? "リンクの有効期限が切れているか、すでに使用済みです。もう一度お試しいただくか、管理者に再発行を依頼してください。"
      : typeof error === "string"
        ? LINE_ERRORS[error]
        : undefined;
  const lineReady = Boolean(lineConfig());

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border-[40px] border-white/5" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] rounded-full border-[56px] border-white/5" />
        <p className="relative text-xs font-medium tracking-[0.2em] text-white/50">株式会社一鴻ホールディングス</p>
        <div className="relative">
          <p className="text-sm font-medium tracking-[0.2em] text-accent">GROUP PORTAL</p>
          <h1 className="mt-4">
            <span className="block whitespace-nowrap text-[clamp(2rem,3.2vw,2.75rem)] font-display font-extrabold italic leading-tight tracking-tight">IKKOU HOLDINGS</span>
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
          <p className="mt-2 whitespace-nowrap font-display text-[1.75rem] font-extrabold italic leading-snug tracking-tight">IKKOU HOLDINGS</p>
          <p className="mt-1 flex items-center gap-2.5 text-base tracking-[0.3em] text-white/80">
            <span className="h-px w-6 bg-accent" />
            ポータル
          </p>
        </div>
        <div className="mx-auto -mt-5 w-full max-w-sm rounded-t-xl bg-white px-6 pt-7 lg:mt-0 lg:rounded-none lg:px-0 lg:pt-0">
          <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" width={168} height={42} priority />
          <h2 className="mt-8 text-xl font-bold text-brand">ログイン</h2>
          <p className="mt-1 text-sm text-slate-500">これまでと同じメールアドレスとパスワードでログインできます</p>
          {errorMessage && (
            <p role="alert" className="mt-5 border-l-4 border-accent bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
              {errorMessage}
            </p>
          )}
          <div className="mt-6">
            <LoginForm />
          </div>
          <div className="mt-3 text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-brand underline-offset-4 hover:text-accent hover:underline">
              パスワードを忘れた方
            </Link>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-line" />
            または
            <span className="h-px flex-1 bg-line" />
          </div>
          {lineReady ? (
            <a
              href="/api/auth/line-redirect?mode=login"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#06c755] px-4 py-3 text-base font-bold text-white transition hover:bg-[#05b34c]"
            >
              <LineMark />
              LINEでログイン
            </a>
          ) : (
            <span className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-[#06c755]/40 px-4 py-3 text-base font-bold text-white">
              <LineMark />
              LINEでログイン（準備中）
            </span>
          )}
          <p className="mt-2 text-center text-xs text-slate-400">初回は「アカウント」画面でLINE連携が必要です</p>
        </div>
      </section>
    </main>
  );
}
