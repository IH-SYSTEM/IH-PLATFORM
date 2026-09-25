"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5">
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
          className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
