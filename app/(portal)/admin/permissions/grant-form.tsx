"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import type { GrantState } from "./actions";

type Opt = { key: string; label: string };

/** 1つの機能の割り当て（立場・担当・個人）。変えられない人には見るだけで出す */
export function GrantForm({
  positions,
  duties,
  staff,
  granted,
  editable,
  action,
}: {
  positions: Opt[];
  duties: Opt[];
  staff: { id: string; name: string; store: string }[];
  granted: string[]; // "position:store" など
  editable: boolean;
  action: (p: GrantState, fd: FormData) => Promise<GrantState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [people, setPeople] = useState<string[]>(granted.filter((g) => g.startsWith("staff:")).map((g) => g.slice(6)));
  const [pick, setPick] = useState("");
  const has = (k: string) => granted.includes(k);
  const box = "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ring-1 ring-slate-200";

  return (
    <form action={formAction} className="space-y-3">
      <fieldset disabled={!editable || pending} className="space-y-3">
        <div>
          <p className="text-xs font-medium text-slate-500">立場で</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {positions.map((p) => (
              <label key={p.key} className={box}>
                <input type="checkbox" name="position" value={p.key} defaultChecked={has(`position:${p.key}`)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">担当で（管理者のときだけ効きます）</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {duties.map((d) => (
              <label key={d.key} className={box}>
                <input type="checkbox" name="duty" value={d.key} defaultChecked={has(`duty:${d.key}`)} />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">個人で（立場や担当に関係なく、この人に付ける）</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {people.map((id) => {
              const s = staff.find((x) => x.id === id);
              return (
                <span key={id} className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm text-brand">
                  <input type="hidden" name="staff" value={id} />
                  {s?.name ?? "（退職）"}
                  {editable && (
                    <button type="button" onClick={() => setPeople((p) => p.filter((x) => x !== id))} className="ml-1 font-bold" aria-label="外す">
                      ×
                    </button>
                  )}
                </span>
              );
            })}
            {editable && (
              <span className="flex gap-1">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                  <option value="">人を選ぶ…</option>
                  {staff
                    .filter((s) => !people.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}（{s.store}）
                      </option>
                    ))}
                </select>
                <button type="button" disabled={!pick} onClick={() => (setPeople((p) => [...p, pick]), setPick(""))} className="rounded-md px-2 text-sm font-bold text-brand ring-1 ring-brand/40 disabled:opacity-40">
                  足す
                </button>
              </span>
            )}
          </div>
        </div>
      </fieldset>
      {editable && (
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "保存しています…" : "この機能の割り当てを保存する"}
        </button>
      )}
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}
