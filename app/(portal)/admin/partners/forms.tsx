"use client";

import { useActionState, useState, useTransition } from "react";
import type { PState } from "./actions";

type Act = (p: PState, fd: FormData) => Promise<PState>;
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

/** 結果の表示。初めのパスワードは、ここで1回だけ出す */
function Result({ state }: { state: PState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm font-bold text-accent">{state.error}</p>;
  return (
    <div className="text-sm">
      <p className="font-bold text-emerald-700">{state.ok}</p>
      {state.password && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">初めのパスワード（この画面を閉じると、もう出ません。メールではなく、電話や手渡しなどで担当者にお伝えください）</p>
          <p className="mt-1 select-all font-mono text-lg font-bold tracking-wider text-slate-900">{state.password}</p>
        </div>
      )}
    </div>
  );
}

export function CreatePartnerForm({ action }: { action: Act }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className="flex flex-wrap gap-2">
      <input name="name" required maxLength={100} placeholder="銀行の名前（例：肥後銀行 熊本営業部）" className={`${input} min-w-0 flex-1`} />
      <input name="note" maxLength={500} placeholder="メモ（任意）" className={`${input} min-w-0 flex-1`} />
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        登録する
      </button>
      <div className="w-full">
        <Result state={state} />
      </div>
    </form>
  );
}

export function AddUserForm({ action, defaultExpires }: { action: Act; defaultExpires: string }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} key={state?.ok ? state.at : "f"} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input name="name" required maxLength={100} placeholder="担当者の名前" className={input} />
        <input name="email" type="email" required placeholder="メールアドレス（ID になります）" className={`${input} min-w-0 flex-1`} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          有効期限
          <input name="expires_on" type="date" required defaultValue={defaultExpires} className={input} />
        </label>
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          IDを作る
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function UserRowForm({ user, update, reset }: { user: { expires_on: string; is_active: boolean }; update: Act; reset: (p: PState) => Promise<PState> }) {
  const [state, act, pending] = useActionState(update, undefined);
  const [rState, rAct, rPending] = useActionState(reset, undefined);
  return (
    <div className="space-y-2">
      <form action={act} className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-xs text-slate-600">
          有効期限
          <input name="expires_on" type="date" defaultValue={user.expires_on} className={input} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input name="is_active" type="checkbox" defaultChecked={user.is_active} className="size-4" />
          使える
        </label>
        <button disabled={pending} className="rounded-md px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-50">
          保存
        </button>
      </form>
      <form
        action={rAct}
        onSubmit={(e) => {
          if (!window.confirm("パスワードを作り直しますか？（今のパスワードは使えなくなり、ログイン中なら切れます）")) e.preventDefault();
        }}
      >
        <button disabled={rPending} className="text-xs text-slate-500 underline disabled:opacity-50">
          パスワードを作り直す
        </button>
      </form>
      <Result state={state} />
      <Result state={rState} />
    </div>
  );
}

type FileOpt = { id: string; label: string; sub: string };
export function SharesForm({ action, companies, files, sharedFiles, sharedSales }: { action: Act; companies: { id: string; name: string }[]; files: Record<string, FileOpt[]>; sharedFiles: string[]; sharedSales: string[] }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className="space-y-4">
      <div>
        <p className="text-sm font-bold text-slate-700">月ごとの売上を見せる会社</p>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {companies.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="sales" value={c.id} defaultChecked={sharedSales.includes(c.id)} className="size-4" />
              {c.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-700">見せる書類（会社の書類から選ぶ）</p>
        {companies.map((c) =>
          (files[c.id] ?? []).length ? (
            <details key={c.id} className="mt-2 rounded-md border border-slate-200 p-3" open={(files[c.id] ?? []).some((f) => sharedFiles.includes(f.id))}>
              <summary className="cursor-pointer text-sm font-bold text-slate-800">
                {c.name}（{(files[c.id] ?? []).filter((f) => sharedFiles.includes(f.id)).length}/{(files[c.id] ?? []).length}）
              </summary>
              <ul className="mt-2 space-y-1">
                {(files[c.id] ?? []).map((f) => (
                  <li key={f.id}>
                    <label className="flex items-baseline gap-2 text-sm">
                      <input type="checkbox" name="file" value={f.id} defaultChecked={sharedFiles.includes(f.id)} className="size-4 translate-y-0.5" />
                      <span className="font-medium text-slate-800">{f.label}</span>
                      <span className="text-xs text-slate-400">{f.sub}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          ) : null,
        )}
      </div>
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "保存しています…" : "見せるものを保存する"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function TogglePartnerButton({ active, act }: { active: boolean; act: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (active && !window.confirm("この銀行を止めますか？担当者は全員、すぐ入れなくなります")) return;
        start(() => act());
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-bold ring-1 disabled:opacity-50 ${active ? "text-accent ring-accent/40" : "text-emerald-700 ring-emerald-300"}`}
    >
      {active ? "この銀行を止める" : "再開する"}
    </button>
  );
}
