"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";

type ForgotState = { sent?: boolean; error?: string; email?: string } | undefined;

async function requestReset(_prev: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim();
  const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
  if (!res) return { error: "送れませんでした。電波のよいところでもう一度お試しください", email };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ? { error: body.error, email } : { sent: true, email };
}

// パスワードを忘れた方：メールで再設定リンクを送る。届かないときは LINE でログインするか、本部にリセットしてもらう
export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestReset, undefined);

  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 pb-12 pt-14 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードの再設定</h1>
        {state?.sent ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-bold">{state.email}</span> 宛てに、パスワード再設定のメールを送りました。
            </p>
            <p>メールのリンクを開き、「新しいパスワードを決める」を押してください。リンクの有効期限は1時間です。</p>
            <p className="text-slate-500">届かないときは、迷惑メールフォルダを見てください。それでも無いときは、店長か本部に「パスワードをリセットしてください」と伝えてください。</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">登録しているメールアドレスを入れてください。再設定用のリンクをメールで送ります。</p>
            <form action={action} className="mt-6 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  メールアドレス
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  defaultValue={state?.email}
                  className="block w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </div>
              {state?.error && (
                <p role="alert" className="border-l-4 border-accent bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
                  {state.error}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-md bg-brand px-4 py-3 text-base font-bold text-white transition hover:bg-brand-2 disabled:opacity-60"
              >
                {pending ? "送信中…" : "再設定メールを送る"}
              </button>
            </form>
            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              LINEと連携している方は、ログイン画面の「LINEでログイン」からも入れます。メールアドレスが分からないときは、店長か本部に「パスワードをリセットしてください」と伝えてください。
            </p>
          </>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm text-slate-500 hover:text-brand">
          ← ログイン画面に戻る
        </Link>
      </div>
    </main>
  );
}
