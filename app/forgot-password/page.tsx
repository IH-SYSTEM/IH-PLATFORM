"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestReset, undefined);

  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 pb-12 pt-14 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードの再設定</h1>
        {state?.sent ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-bold">{state.email}</span> 宛てに、パスワード再設定のメールを送りました。
            </p>
            <p>メールに記載のリンクを開いて、新しいパスワードを設定してください。リンクの有効期限は1時間です。</p>
            <p className="text-slate-500">メールが届かない場合は、迷惑メールフォルダを確認するか、管理者に「パスワード設定リンク」の発行を依頼してください。</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">登録しているメールアドレスを入力してください。再設定用のリンクをお送りします。</p>
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
          </>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm text-slate-500 hover:text-brand">
          ← ログイン画面に戻る
        </Link>
      </div>
    </main>
  );
}
