"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/app/toast";
import { PERMISSIONS } from "@/lib/staff";
import type { DutyState } from "./duty-actions";

type Duty = { key: string; label: string; description: string; exclusive_with: string[] };

/** 立場（見られる範囲）と担当（入力・承認できる仕事）。変えられるのはシステム担当か代表だけ */
export function DutyPanel({
  permission,
  duties,
  all,
  action,
  editable,
  reason,
  canGrantSuperadmin,
}: {
  permission: string;
  duties: string[];
  all: Duty[];
  action: (prev: DutyState, fd: FormData) => Promise<DutyState>;
  editable: boolean;
  reason: string | null;
  canGrantSuperadmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [perm, setPerm] = useState(permission);
  const [picked, setPicked] = useState<string[]>(duties);
  const isAdminRole = perm === "admin" || perm === "superadmin";
  const blocked = (d: Duty) => d.exclusive_with.some((x) => picked.includes(x));

  return (
    <form action={formAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">立場と担当</h2>
      <p className="mt-0.5 text-xs text-slate-500">立場で「見られる範囲」が、担当で「入力・承認できる仕事」が決まります。管理者でも担当がなければ見るだけです</p>
      <fieldset disabled={!editable || pending} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">立場</span>
          <select
            name="permission"
            value={perm}
            onChange={(e) => setPerm(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {PERMISSIONS.filter((p) => p.value !== "superadmin" || canGrantSuperadmin || permission === "superadmin").map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="text-sm font-medium text-slate-700">担当（兼任できます）</span>
          {!isAdminRole && <p className="mt-1 text-xs text-slate-400">担当を持てるのは、立場が「管理者」以上の人だけです</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {all.map((d) => (
              <label key={d.key} className={`flex gap-2 rounded-md border p-3 text-sm ${picked.includes(d.key) ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                <input
                  type="checkbox"
                  name="duty"
                  value={d.key}
                  checked={picked.includes(d.key)}
                  disabled={!isAdminRole || (!picked.includes(d.key) && blocked(d))}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.key] : p.filter((x) => x !== d.key)))}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium text-slate-800">{d.label}</span>
                  <span className="block text-xs text-slate-500">{d.description}</span>
                  {!picked.includes(d.key) && blocked(d) && <span className="block text-xs text-amber-700">ほかの担当と一緒に持てません</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {editable ? (
        <button type="submit" disabled={pending} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "保存しています…" : "立場と担当を保存する"}
        </button>
      ) : (
        reason && <p className="mt-3 text-xs text-slate-500">{reason}</p>
      )}
      {state?.ok && <Toast key={state.at} message="立場と担当を保存しました" />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}
