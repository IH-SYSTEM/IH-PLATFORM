"use client";

import { useState } from "react";
import { CellEditor, RequestMark, TYPE_LABEL, type Cell, type GridRow } from "./shift-grid";
import { InlineApprove, RejectedMark } from "./inline-approve";

export type WeekStatus = { monday: string; decided: boolean; deadline: string; submitted: boolean };

const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/** 1人の1か月を、月曜はじまりのカレンダーで出す。マスを押すと週の一覧と同じ編集画面 */
export function PersonCalendar({
  storeId,
  row,
  month,
  weeks,
  roles,
  defaults,
}: {
  storeId: string;
  row: GridRow;
  month: string;
  weeks: (WeekStatus & { cells: (Cell | null)[] })[];
  roles: string[];
  defaults: { start: string; end: string };
}) {
  const [editing, setEditing] = useState<Cell | null>(null);
  return (
    <>
      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[900px] table-fixed text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {row.partTime && <th className="w-24 px-2 py-2 text-left font-medium">週</th>}
              {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                <th key={d} className={`py-2 font-medium ${d === "土" ? "text-brand" : d === "日" ? "text-accent" : ""}`}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {weeks.map((w) => (
              <tr key={w.monday}>
                {row.partTime && (
                  <td className="px-2 py-2 align-top text-[10px] leading-relaxed">
                    {w.decided ? (
                      <span className="font-bold text-emerald-700">確定済み</span>
                    ) : (
                      <span className="font-bold text-amber-700">未確定</span>
                    )}
                    <span className="block text-slate-400">期限 {md(w.deadline)}</span>
                    {!w.submitted && <span className="block font-bold text-accent">希望未提出</span>}
                  </td>
                )}
                {w.cells.map((c, i) => {
                  if (!c) return <td key={i} className="bg-slate-50/60" />;
                  const hasRequest = Boolean(c.request && c.request.a !== "off");
                  const editable = !c.locked && !c.shift?.otherStore && (!row.partTime || hasRequest || Boolean(c.shift));
                  const waiting = row.partTime && hasRequest && !c.shift && !c.request?.rejected;
                  const day = dow(c.date);
                  if (row.partTime && hasRequest && !c.shift && !c.locked) {
                    return (
                      <td key={c.date} className="p-1 align-top">
                        <p className={`text-xs font-bold ${day === 0 ? "text-accent" : day === 6 ? "text-brand" : "text-slate-700"}`}>
                          {Number(c.date.slice(8, 10))} <span className="text-[10px] font-normal"><RequestMark r={c.request} partTime /></span>
                        </p>
                        {c.request?.rejected ? (
                          <RejectedMark storeId={storeId} staffId={row.id} date={c.date} />
                        ) : (
                          <InlineApprove
                            storeId={storeId}
                            staffId={row.id}
                            date={c.date}
                            start={c.request?.a === "partial" || c.request?.urgent ? c.request.s : defaults.start}
                            end={c.request?.a === "partial" || c.request?.urgent ? c.request.e : defaults.end}
                            roles={roles}
                          />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={c.date} className="p-1 align-top">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => setEditing(c)}
                        className={`flex min-h-[78px] w-full flex-col items-start gap-0.5 rounded-md border p-1.5 text-left ${
                          c.shift?.type === "work" ? "border-brand/30 bg-brand-soft" : c.shift ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-200"
                        } ${editable ? "hover:border-brand" : "cursor-default opacity-70"} ${c.date.slice(0, 7) !== month ? "opacity-40" : ""}`}
                      >
                        <span className={`text-xs font-bold ${day === 0 ? "text-accent" : day === 6 ? "text-brand" : "text-slate-700"}`}>{Number(c.date.slice(8, 10))}</span>
                        <span className="text-[10px]">
                          <RequestMark r={c.request} partTime={row.partTime} />
                        </span>
                        {waiting && <span className="text-[10px] font-bold text-amber-700">待機</span>}
                        {c.shift && (
                          <span className={`text-[11px] font-bold tabular-nums ${c.shift.type === "work" ? "text-brand" : "text-slate-500"}`}>
                            {c.shift.otherStore ? "他店" : c.shift.type === "work" ? `${c.shift.s}〜${c.shift.e}` : TYPE_LABEL[c.shift.type]}
                          </span>
                        )}
                        {c.shift?.role && !c.shift.otherStore && <span className="max-w-full truncate rounded bg-brand px-1 text-[10px] font-bold text-white">{c.shift.role}</span>}
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
        各日の上が本人の希望、下が確定したシフトです。日を押して編集します。アルバイトは希望が出ている日だけ確定できます（「待機」＝希望あり・未確定）。スタッフに見えるのは、週（アルバイト）・月（社員）を確定したあとです
      </p>
      {editing && (
        <CellEditor key={editing.date} storeId={storeId} row={row} cell={editing} roles={roles} defaults={defaults} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
