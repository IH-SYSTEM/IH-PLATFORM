"use client";

import { useActionState } from "react";
import type { ConceptState } from "./actions";

const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function ConceptForm({ action, initial, label }: { action: (p: ConceptState, fd: FormData) => Promise<ConceptState>; initial?: { scope: string; title: string; body: string }; label: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} key={!initial && state?.ok ? state.at : "f"} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <input name="scope" defaultValue={initial?.scope ?? ""} placeholder="対象（例：obanzai・HD・グループ全体）" className={input} />
        <input name="title" defaultValue={initial?.title ?? ""} required maxLength={100} placeholder="柱の見出し（例：チャージは取らない）" className={input} />
      </div>
      <textarea name="body" defaultValue={initial?.body ?? ""} required maxLength={4000} rows={initial ? 5 : 4} placeholder="中身と理由（なぜそう決めたか、何をしないか）" className={input} />
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && initial && <p className="text-sm font-bold text-emerald-700">保存しました</p>}
      <button disabled={pending} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "保存中…" : label}
      </button>
    </form>
  );
}
