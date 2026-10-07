"use client";

import { useActionState } from "react";
import type { ImportResult } from "./import-actions";

export function ImportButton({ label, action }: { label: string; action: (prev: ImportResult | undefined) => Promise<ImportResult> }) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">勤怠から取り込む</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {label}の打刻とシフトから、出勤日数・勤務時間・残業・深夜・休日・遅刻・早退・有給を計算して、下書きに入れます。確定済みの人は変わりません。何度押しても同じ結果になります
          </p>
        </div>
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!confirm(`${label}の勤怠を取り込み、下書きの勤務時間・割増・社会保険料・所得税を計算し直します。よろしいですか？`)) e.preventDefault();
          }}
        >
          <button disabled={pending} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60">
            {pending ? "取り込んでいます…" : "勤怠から取り込む"}
          </button>
        </form>
      </div>

      {state?.error && <p className="mt-3 text-sm font-bold text-accent">{state.error}</p>}
      {state?.ok && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3 text-sm">
          <p className="font-bold text-emerald-700">{state.imported?.length ?? 0}名を下書きに取り込みました</p>
          {(state.openDays?.length ?? 0) > 0 && (
            <div className="rounded-md bg-accent-soft px-3 py-2 text-accent">
              <p className="font-bold">退勤の記録がない日があります（その日は勤務時間に入っていません。打刻修正で直してから、もう一度取り込んでください）</p>
              <ul className="mt-1 list-inside list-disc">
                {state.openDays!.map((o) => (
                  <li key={o.name}>
                    {o.name}：{o.dates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join("、")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(state.skippedConfirmed?.length ?? 0) > 0 && <p className="text-slate-600">確定済みのため変えなかった人：{state.skippedConfirmed!.join("、")}</p>}
          {(state.noMaster?.length ?? 0) > 0 && <p className="text-amber-700">給与形態が未設定のため取り込めなかった人：{state.noMaster!.join("、")}（スタッフ管理の給与マスタで設定してください）</p>}
          {(state.imported?.length ?? 0) > 0 && (
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 text-left font-medium">名前</th>
                  <th className="py-1 text-right font-medium">出勤</th>
                  <th className="py-1 text-right font-medium">勤務</th>
                  <th className="py-1 text-right font-medium">残業</th>
                  <th className="py-1 text-right font-medium">深夜</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {state.imported!.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="py-1">{r.name}</td>
                    <td className="py-1 text-right">{r.workDays}日</td>
                    <td className="py-1 text-right">{r.hours}時間</td>
                    <td className="py-1 text-right">{r.overtime}時間</td>
                    <td className="py-1 text-right">{r.night}時間</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
