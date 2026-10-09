"use client";

import { useActionState, useState, useTransition } from "react";
import { rejectRequest, saveShift, type ShiftState } from "./actions";

const time = "w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-1 text-[11px] tabular-nums";

/**
 * アルバイトの希望を、表の中でそのまま確定する。希望の時間が入った状態で時刻と役割を直し、承認か却下を押す。
 * 承認＝その日の確定シフトを作る。却下＝待機から外す（あとで取り消せる）
 */
export function InlineApprove({
  storeId,
  staffId,
  date,
  start,
  end,
  roles,
}: {
  storeId: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  roles: string[];
}) {
  const [state, action, pending] = useActionState<ShiftState, FormData>(saveShift.bind(null, storeId, staffId, date), undefined);
  const [rejecting, startReject] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form action={action} className="flex w-full flex-col gap-1 rounded-md border border-amber-300 bg-amber-50/60 p-1">
      <input type="hidden" name="type" value="work" />
      <input type="time" name="start" defaultValue={start} required aria-label="開始" className={time} />
      <input type="time" name="end" defaultValue={end} required aria-label="終了" className={time} />
      {roles.length > 0 && (
        <select name="role" required defaultValue="" aria-label="役割" className={time}>
          <option value="" disabled>
            役割
          </option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-1">
        <button disabled={pending || rejecting} className="rounded bg-brand py-1 text-[11px] font-bold text-white disabled:opacity-50">
          {pending ? "…" : "承認"}
        </button>
        <button
          type="button"
          disabled={pending || rejecting}
          onClick={() =>
            startReject(async () => {
              const r = await rejectRequest(storeId, staffId, date);
              setError(r?.error ?? null);
            })
          }
          className="rounded bg-white py-1 text-[11px] font-bold text-accent ring-1 ring-accent/40 disabled:opacity-50"
        >
          {rejecting ? "…" : "却下"}
        </button>
      </div>
      {(state?.error || error) && <p className="text-[10px] leading-tight text-accent">{state?.error ?? error}</p>}
    </form>
  );
}

/** 却下した希望。取り消すと、また承認・却下を選べる */
export function RejectedMark({ storeId, staffId, date }: { storeId: string; staffId: string; date: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex w-full flex-col items-center gap-0.5 rounded-md border border-dashed border-slate-300 py-1.5 text-[10px] text-slate-500">
      <span className="font-bold">却下</span>
      <button type="button" disabled={pending} onClick={() => start(async () => void (await rejectRequest(storeId, staffId, date, true)))} className="text-brand underline">
        {pending ? "…" : "取り消す"}
      </button>
    </div>
  );
}
