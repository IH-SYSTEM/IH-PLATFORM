"use client";

import { useActionState } from "react";
import type { EditState } from "../actions";

type Option = { value: string; label: string };
type Action = (prev: EditState, fd: FormData) => Promise<EditState>;

const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900";

export function EditForm({
  isNew,
  reasons,
  staff,
  stores,
  initial,
  save,
  remove,
}: {
  isNew: boolean;
  reasons: readonly string[];
  staff: Option[];
  stores: Option[];
  initial: Record<string, string>;
  save: Action;
  remove: Action | null;
}) {
  const [state, saveAction, saving] = useActionState(save, undefined);
  const [delState, deleteAction, deleting] = useActionState(remove ?? (async () => undefined), undefined);

  return (
    <div className="space-y-4">
      <form action={saveAction} className="space-y-4 rounded-md border border-line bg-white p-5">
        {isNew && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Labeled label="スタッフ">
              <select name="staff" defaultValue={initial.staff} required className={input}>
                <option value="">選んでください</option>
                {staff.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="店舗">
              <select name="store" defaultValue={initial.store} required className={input}>
                <option value="">選んでください</option>
                {stores.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="勤務日" hint="朝6時より前の退勤は前日の勤務">
              <input type="date" name="date" defaultValue={initial.date} required className={input} />
            </Labeled>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="出勤時刻">
            <input type="time" name="checkin" defaultValue={initial.checkin} required className={input} />
          </Labeled>
          <Labeled label="退勤時刻" hint="00:30 なら翌日の0:30として保存します。空欄＝未退勤">
            <input type="time" name="checkout" defaultValue={initial.checkout} className={input} />
          </Labeled>
          <Labeled label="休憩（分）">
            <input type="number" name="break_minutes" min={0} max={600} step={5} defaultValue={initial.break_minutes} className={input} />
          </Labeled>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="理由">
            <select name="reason" defaultValue="" required className={input}>
              <option value="">選んでください</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="メモ（任意）" className="sm:col-span-2">
            <input name="note" maxLength={200} placeholder="店長に確認済み など" className={input} />
          </Labeled>
        </div>
        {state?.error && <p className="text-sm font-bold text-accent">{state.error}</p>}
        <button disabled={saving} className="rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-2 disabled:opacity-60">
          {saving ? "保存しています…" : isNew ? "記録を追加する" : "修正を保存する"}
        </button>
      </form>

      {remove && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("この日の打刻の記録を削除します。よろしいですか？（変更履歴には残ります）")) e.preventDefault();
          }}
          className="flex flex-wrap items-end gap-3 rounded-md border border-accent/30 bg-white p-4"
        >
          <Labeled label="削除の理由">
            <select name="reason" defaultValue="" required className={input}>
              <option value="">選んでください</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Labeled>
          <button disabled={deleting} className="rounded-lg border border-accent px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent-soft disabled:opacity-60">
            {deleting ? "削除しています…" : "この記録を削除"}
          </button>
          {delState?.error && <p className="w-full text-sm font-bold text-accent">{delState.error}</p>}
        </form>
      )}
    </div>
  );
}

function Labeled({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
