"use client";

import { useActionState, useEffect, useState } from "react";
import { saveShift, type ShiftState } from "./actions";
import { sendUrgentCall, type UrgentState } from "./urgent-actions";

type Cell = {
  date: string;
  request: { a: string; s: string; e: string; urgent?: boolean } | null;
  shift: { type: string; s: string; e: string; otherStore: boolean } | null;
  locked: boolean;
};
export type GridRow = { id: string; name: string; kind: string; help: boolean; partTime: boolean; notSubmitted: boolean; cells: Cell[] };

const TYPE_LABEL: Record<string, string> = { work: "出勤", off: "公休", paid_leave: "有給", special: "特別" };
const dow = (ymd: string) => "日月火水木金土"[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

function RequestMark({ r, partTime }: { r: Cell["request"]; partTime?: boolean }) {
  if (!r) return <span className="text-slate-300">{partTime ? "希望なし" : "未提出"}</span>;
  if (r.urgent) return <span className="font-bold text-accent">急募 {r.s}〜{r.e}</span>;
  if (r.a === "all") return <span className="text-emerald-700">○</span>;
  if (r.a === "off") return <span className="text-slate-400">×</span>;
  return (
    <span className="text-brand">
      ◇{r.s}〜{r.e}
    </span>
  );
}

export function ShiftGrid({
  storeId,
  days,
  urgentDays,
  urgentReasons,
  urgentUsed,
  rows,
  defaults,
}: {
  storeId: string;
  days: string[];
  urgentDays: string[];
  urgentReasons: readonly string[];
  urgentUsed: Record<string, number>;
  rows: GridRow[];
  defaults: { start: string; end: string };
}) {
  const [editing, setEditing] = useState<{ row: GridRow; cell: Cell } | null>(null);
  const [urgent, setUrgent] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[760px] table-fixed text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-32 px-2 py-2 text-left font-medium">スタッフ</th>
              {days.map((d) => (
                <th key={d} className={`px-1 py-2 font-medium ${["土", "日"].includes(dow(d)) ? "text-accent" : ""}`}>
                  {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}（{dow(d)}）
                  {urgentDays.includes(d) && (
                    <button
                      type="button"
                      onClick={() => setUrgent(d)}
                      disabled={(urgentUsed[d] ?? 0) >= 2}
                      className="mt-1 block w-full rounded bg-accent px-1 py-0.5 text-[10px] font-bold text-white disabled:bg-slate-300"
                      title="その日シフトのないアルバイトに、LINEで募ります（同じ日に2回まで）"
                    >
                      急募{urgentUsed[d] ? `（${urgentUsed[d]}/2）` : ""}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-2 align-top">
                  <span className="block truncate text-sm font-bold text-slate-800">{row.name}</span>
                  <span className="text-[10px] text-slate-400">
                    {row.kind}
                    {row.help && "・ヘルプ"}
                  </span>
                </td>
                {row.cells.map((c) => {
                  const hasRequest = Boolean(c.request && c.request.a !== "off");
                  const editable = !c.locked && !c.shift?.otherStore && (!row.partTime || hasRequest || Boolean(c.shift));
                  const waiting = row.partTime && hasRequest && !c.shift;
                  return (
                    <td key={c.date} className="p-1 align-top">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => setEditing({ row, cell: c })}
                        className={`flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-md border text-center ${
                          c.shift?.type === "work"
                            ? "border-brand/30 bg-brand-soft"
                            : c.shift
                              ? "border-slate-200 bg-slate-50"
                              : "border-dashed border-slate-200"
                        } ${editable ? "hover:border-brand" : "cursor-default opacity-70"}`}
                      >
                        <span className="text-[10px]">
                          <RequestMark r={c.request} partTime={row.partTime} />
                        </span>
                        {waiting && <span className="text-[10px] font-bold text-amber-700">待機</span>}
                        {c.shift && (
                          <span className={`font-bold tabular-nums ${c.shift.type === "work" ? "text-brand" : "text-slate-500"}`}>
                            {c.shift.otherStore ? "他店" : c.shift.type === "work" ? `${c.shift.s}〜${c.shift.e}` : TYPE_LABEL[c.shift.type]}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        上段が本人の希望、下段が確定したシフトです。マスを押して編集します。アルバイトは希望が出ている日だけ確定できます（「待機」＝希望あり・未確定）。人が足りない日は、3日前から日付の下の［急募］で募れます。過ぎた日は変更できません
      </p>

      {urgent && <UrgentEditor storeId={storeId} date={urgent} reasons={urgentReasons} defaults={defaults} onClose={() => setUrgent(null)} />}
      {editing && <CellEditor key={`${editing.row.id}:${editing.cell.date}`} storeId={storeId} {...editing} defaults={defaults} onClose={() => setEditing(null)} />}
    </>
  );
}

function CellEditor({ storeId, row, cell, defaults, onClose }: { storeId: string; row: GridRow; cell: Cell; defaults: { start: string; end: string }; onClose: () => void }) {
  const [state, action, pending] = useActionState<ShiftState, FormData>(saveShift.bind(null, storeId, row.id, cell.date), undefined);
  const [type, setType] = useState(cell.shift?.type ?? (cell.request?.a === "off" ? "off" : "work"));
  const start = cell.shift?.s || (cell.request?.a === "partial" ? cell.request.s : defaults.start);
  const end = cell.shift?.e || (cell.request?.a === "partial" ? cell.request.e : defaults.end);

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-t-lg bg-white p-5 sm:rounded-lg">
        <div>
          <p className="text-xs text-slate-500">
            {Number(cell.date.slice(5, 7))}/{Number(cell.date.slice(8, 10))}（{dow(cell.date)}）
          </p>
          <p className="text-lg font-bold text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">
            希望：<RequestMark r={cell.request} />
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {Object.entries(TYPE_LABEL).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={`rounded-md py-2 text-sm font-bold ${type === k ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />
        {type === "work" && (
          <div className="flex items-center gap-2">
            <input type="time" name="start" defaultValue={start} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
            〜
            <input type="time" name="end" defaultValue={end} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
          </div>
        )}
        {type === "work" && <p className="text-xs text-slate-400">終了が開始より前なら、翌日（日をまたぐ）として扱います</p>}
        {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
        <div className="flex gap-2">
          <button disabled={pending} className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-white disabled:opacity-60">
            {pending ? "保存中…" : "保存"}
          </button>
          {cell.shift && (
            <button
              type="submit"
              name="clear"
              value="1"
              disabled={pending}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-600"
            >
              消す
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-3 text-sm text-slate-500">
            閉じる
          </button>
        </div>
      </form>
    </div>
  );
}

function UrgentEditor({
  storeId,
  date,
  reasons,
  defaults,
  onClose,
}: {
  storeId: string;
  date: string;
  reasons: readonly string[];
  defaults: { start: string; end: string };
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<UrgentState, FormData>(sendUrgentCall.bind(null, storeId, date), undefined);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-t-lg bg-white p-5 sm:rounded-lg">
        <div>
          <p className="text-xs font-bold text-accent">急募（LINEで募る）</p>
          <p className="text-lg font-bold text-slate-900">
            {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}（{dow(date)}）
          </p>
          <p className="text-xs text-slate-500">この店のアルバイトで、この日シフトのない人全員に送ります。同じ日に2回まで。乱用しないでください</p>
        </div>
        {state?.ok ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{state.ok}</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input type="time" name="start" defaultValue={defaults.start} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
              〜
              <input type="time" name="end" defaultValue={defaults.end} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
            </div>
            <select name="reason" defaultValue="" required className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="" disabled>
                理由を選んでください（必須）
              </option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input name="note" maxLength={100} placeholder="補足（「その他」は必須。例：20名の団体予約）" className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
          </>
        )}
        <div className="flex gap-2">
          {!state?.ok && (
            <button disabled={pending} className="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-white disabled:opacity-60">
              {pending ? "送信中…" : "LINEで急募を送る"}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-3 text-sm text-slate-500">
            閉じる
          </button>
        </div>
      </form>
    </div>
  );
}
