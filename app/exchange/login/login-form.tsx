"use client";

import { useActionState } from "react";
import { partnerLogin } from "./actions";

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";

export function LoginForm() {
  const [state, action, pending] = useActionState(partnerLogin, undefined);
  const code = state?.step === "code";
  return (
    <form action={action} className="mt-5 space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="step" value={code ? "code" : "password"} />
      {code ? (
        <>
          <p className="text-sm text-slate-600">{state?.email} あてに、6桁の確認コードを送りました（10分以内に入力してください）</p>
          <label className="block text-sm font-medium text-slate-700">
            確認コード
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={`${input} tracking-[0.4em]`} />
          </label>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-slate-700">
            ID（メールアドレス）
            <input name="email" type="email" autoComplete="username" required className={input} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            パスワード
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </label>
        </>
      )}
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-brand py-3 text-base font-bold text-white disabled:opacity-60">
        {pending ? "確認しています…" : code ? "ログインする" : "次へ（確認コードを送る）"}
      </button>
    </form>
  );
}
