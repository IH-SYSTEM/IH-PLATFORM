"use client";

import { useActionState } from "react";
import type { TitleState } from "./actions";

type Act = (p: TitleState, fd: FormData) => Promise<TitleState>;
const input = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function AddTitleForm({ action }: { action: Act }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className="grid gap-2 rounded-md border border-line bg-white p-4 sm:grid-cols-[12rem_minmax(0,1fr)_5rem_auto]">
      <input name="name" maxLength={40} required placeholder="例：地代家賃" className={input} aria-label="勘定科目" />
      <input name="hint" maxLength={200} placeholder="AI への目安（例：家賃・テナント料・駐車場代）" className={input} />
      <input name="sort" inputMode="numeric" placeholder="並び" className={input} />
      <button disabled={pending} className="rounded-md bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "…" : "＋ 足す"}
      </button>
      {state?.ok && <p className="text-xs font-bold text-emerald-700 sm:col-span-4">{state.ok}</p>}
      {state?.error && <p className="text-xs font-bold text-accent sm:col-span-4">{state.error}</p>}
    </form>
  );
}

export function TitleRow({ t, action }: { t: { name: string; hint: string | null; sort: number; active: boolean }; action: Act }) {
  const [state, act, pending] = useActionState(action, undefined);
  return (
    <form action={act} className={`grid items-center gap-2 px-4 py-2 sm:grid-cols-[12rem_minmax(0,1fr)_5rem_auto] ${t.active ? "" : "opacity-50"}`}>
      <span className="font-bold text-slate-900">{t.name}</span>
      <input name="hint" defaultValue={t.hint ?? ""} maxLength={200} className={input} aria-label="AI への目安" />
      <input name="sort" defaultValue={t.sort} inputMode="numeric" className={`${input} text-right`} aria-label="並び" />
      <span className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="active" defaultChecked={t.active} /> 使う
        </label>
        <button disabled={pending} className="rounded-full bg-slate-800 px-3 py-1 font-bold text-white disabled:opacity-50">
          {pending ? "…" : "保存"}
        </button>
        {state?.ok && <span className="text-emerald-700">✓</span>}
        {state?.error && <span className="font-bold text-accent">{state.error}</span>}
      </span>
    </form>
  );
}
