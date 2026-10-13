"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { OrgState } from "./actions";

type Person = { id: string; name: string; store: string };

/** 責任者の付け外し（複数可） */
export function HeadsForm({ heads, people, editable, action }: { heads: string[]; people: Person[]; editable: boolean; action: (p: OrgState, fd: FormData) => Promise<OrgState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [picked, setPicked] = useState(heads);
  const [pick, setPick] = useState("");
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "（退職）";
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {picked.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-0.5 text-sm text-brand">
          <input type="hidden" name="head" value={id} />
          {name(id)}
          {editable && (
            <button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} className="ml-1 font-bold" aria-label="外す">
              ×
            </button>
          )}
        </span>
      ))}
      {!picked.length && <span className="text-sm text-slate-400">責任者なし</span>}
      {editable && (
        <>
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="">責任者を足す…</option>
            {people
              .filter((p) => !picked.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.store}）
                </option>
              ))}
          </select>
          {pick && (
            <button type="button" onClick={() => (setPicked((p) => [...p, pick]), setPick(""))} className="rounded-md px-2 py-1 text-sm font-bold text-brand ring-1 ring-brand/40">
              足す
            </button>
          )}
          {JSON.stringify(picked) !== JSON.stringify(heads) && (
            <button disabled={pending} className="rounded-md bg-brand px-3 py-1 text-sm font-bold text-white disabled:opacity-50">
              保存
            </button>
          )}
        </>
      )}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}

/** グループ全体の役職を付ける */
export function TitleForm({ people, action }: { people: Person[]; action: (p: OrgState, fd: FormData) => Promise<OrgState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} key={state?.ok ? state.at : "f"} className="flex flex-wrap gap-2">
      <select name="staff_id" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">人を選ぶ…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}（{p.store}）
          </option>
        ))}
      </select>
      <select name="title" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value="社長">社長</option>
        <option value="部長">部長</option>
        <option value="経理主任">経理主任</option>
        <option value="">（役職を外す）</option>
      </select>
      <button disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
        保存
      </button>
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}
