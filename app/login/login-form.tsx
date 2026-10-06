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
          className="block w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
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
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
