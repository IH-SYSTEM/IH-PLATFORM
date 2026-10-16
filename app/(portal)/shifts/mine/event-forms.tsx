"use client";

import { useActionState, useState, useTransition } from "react";
import { Toast } from "@/app/toast";
import { addEvent, deleteEvent, updateEvent, type EventState } from "./actions";

const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
type Ev = { id: string; event_date: string; start_time: string | null; end_time: string | null; title: string; note: string | null };

function Fields({ ev, defaultDate }: { ev?: Ev; defaultDate: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_6rem_6rem_minmax(0,1fr)]">
      <input name="event_date" type="date" required defaultValue={ev?.event_date ?? defaultDate} className={input} aria-label="日付" />
      <input name="start_time" type="time" defaultValue={ev?.start_time?.slice(0, 5) ?? ""} className={input} aria-label="始まり" />
      <input name="end_time" type="time" defaultValue={ev?.end_time?.slice(0, 5) ?? ""} className={input} aria-label="終わり" />
      <input name="title" required maxLength={60} defaultValue={ev?.title ?? ""} placeholder="予定（例：病院・研修・美容室）" className={input} />
      <input name="note" maxLength={500} defaultValue={ev?.note ?? ""} placeholder="メモ（任意）" className={`${input} sm:col-span-4`} />
    </div>
  );
}

/** 自分の予定を入れる（時刻を空にすると終日） */
export function AddEventForm({ defaultDate }: { defaultDate: string }) {
  const [state, act, pending] = useActionState(addEvent, undefined as EventState);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        ＋ 自分の予定を入れる
      </button>
    );
  return (
    <form action={act} key={state?.ok ? state.at : "f"} className="space-y-2 rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm font-bold text-slate-800">自分の予定を入れる</p>
      <p className="text-xs text-slate-500">自分だけが見られます。時刻を空にすると「終日」になります</p>
      <Fields defaultDate={defaultDate} />
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "保存しています…" : "入れる"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-slate-500">
          閉じる
        </button>
      </div>
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}

/** 予定1つ（押すと直す・消す） */
export function EventRow({ ev, label }: { ev: Ev; label: string }) {
  const [state, act, pending] = useActionState(updateEvent.bind(null, ev.id), undefined as EventState);
  const [delPending, startDel] = useTransition();
  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[5.5rem_6.5rem_minmax(0,1fr)] items-center gap-2 py-2 text-sm">
        <span className="tabular-nums text-slate-500">{label}</span>
        <span className="tabular-nums text-slate-500">{ev.start_time ? `${ev.start_time.slice(0, 5)}〜${ev.end_time?.slice(0, 5) ?? ""}` : "終日"}</span>
        <span className="truncate font-medium text-slate-800">
          {ev.title}
          {ev.note && <span className="ml-2 text-xs font-normal text-slate-400">{ev.note}</span>}
        </span>
      </summary>
      <form action={act} className="mb-2 space-y-2 rounded-md bg-slate-50 p-3">
        <Fields ev={ev} defaultDate={ev.event_date} />
        <div className="flex items-center gap-3">
          <button disabled={pending} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            直す
          </button>
          <button
            type="button"
            disabled={delPending}
            onClick={() => {
              if (window.confirm("この予定を消しますか？")) startDel(() => deleteEvent(ev.id));
            }}
            className="text-sm text-accent disabled:opacity-50"
          >
            消す
          </button>
        </div>
        {state?.ok && <Toast key={state.at} message={state.ok} />}
        {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
      </form>
    </details>
  );
}
