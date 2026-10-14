"use client";

import { useActionState, useTransition } from "react";
import { applyPosDataset, approveFinancials, rejectOfficial, runMaintenanceNow, type ReviewState } from "./actions";

const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

/** エアレジの CSV：店を選んで売上に取り込む */
export function PosApplyForm({ datasetId, stores }: { datasetId: string; stores: { id: string; name: string }[] }) {
  const [state, act, pending] = useActionState(applyPosDataset.bind(null, datasetId), undefined as ReviewState);
  const [rp, startReject] = useTransition();
  return (
    <form action={act} className="mt-2 flex flex-wrap items-center gap-2">
      <select name="store_id" required defaultValue="" className={input}>
        <option value="" disabled>
          どの店の CSV ですか？
        </option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "取り込んでいます…" : "売上に取り込む"}
      </button>
      <button type="button" disabled={rp} onClick={() => startReject(() => rejectOfficial(datasetId))} className="text-xs text-slate-500 underline">
        売上には入れない（参考として残す）
      </button>
      {state?.ok && <p className="w-full text-sm font-bold text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="w-full text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}

const FIN = [
  ["revenue", "売上高"],
  ["gross_profit", "売上総利益"],
  ["operating_income", "営業利益"],
  ["ordinary_income", "経常利益"],
  ["net_income", "当期純利益"],
  ["total_assets", "総資産"],
  ["net_assets", "純資産"],
  ["borrowings", "借入金"],
  ["cash", "現金及び預金"],
] as const;

/** 決算の数字：AI の読み取りを確かめ（直し）て公式にする */
export function FinancialsForm({ statementId, datasetId, values }: { statementId: string; datasetId: string | null; values: Record<string, number | null> }) {
  const [state, act, pending] = useActionState(approveFinancials.bind(null, statementId), undefined as ReviewState);
  const [rp, startReject] = useTransition();
  return (
    <form action={act} className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {FIN.map(([k, l]) => (
          <label key={k} className="block text-xs text-slate-600">
            {l}（円）
            <input name={k} defaultValue={values[k] ?? ""} inputMode="numeric" className={`${input} mt-0.5 w-full tabular-nums`} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "保存しています…" : "これでいい（公式にする）"}
        </button>
        {datasetId && (
          <button type="button" disabled={rp} onClick={() => startReject(() => rejectOfficial(datasetId))} className="text-xs text-slate-500 underline">
            公式にしない
          </button>
        )}
      </div>
      {state?.ok && <p className="text-sm font-bold text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}

export function MaintenanceButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => runMaintenanceNow())} className="rounded-md px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-50">
      {pending ? "整理しています…（1分ほど）" : "今すぐ整理する"}
    </button>
  );
}
