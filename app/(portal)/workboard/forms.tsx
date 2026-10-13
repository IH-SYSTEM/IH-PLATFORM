"use client";

import { useActionState, useState, useTransition } from "react";
import { Toast } from "@/app/toast";
import type { WbState } from "./actions";

type Option = { id: string; name: string };
const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const IMPORTANCE = ["重要", "確認", "指示", "お知らせ", "その他"];
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** お知らせ・定期配信の入力（中身と出す相手は共通。mode で「いつ出すか」の欄が変わる） */
export function NoticeForm({
  mode,
  stores,
  staff,
  canAll,
  today,
  action,
}: {
  mode: "notice" | "schedule";
  stores: Option[];
  staff: (Option & { store: string })[];
  canAll: boolean;
  today: string;
  action: (p: WbState, fd: FormData) => Promise<WbState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [audience, setAudience] = useState(stores.length === 1 ? "store" : canAll ? "all" : "store");
  const [recurrence, setRecurrence] = useState("monthly");

  return (
    <form action={formAction} key={state?.ok ? state.at : "form"} className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">いつ見せるか</span>
          <select name="timing" className={input}>
            <option value="check_in">出勤前（確認しないと出勤できない）</option>
            <option value="check_out">退勤前（確認しないと退勤できない）</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">重要度</span>
          <select name="importance" defaultValue="お知らせ" className={input}>
            {IMPORTANCE.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">タイトル（100文字まで）</span>
        <input name="title" maxLength={100} required className={input} placeholder="例：今日は月末の棚卸しです" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">本文（2000文字まで）</span>
        <textarea name="body" maxLength={2000} rows={4} required className={input} />
      </label>

      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">出す相手</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {[...(canAll ? [["all", "全員"]] : []), ["store", "店舗を選ぶ"], ["staff", "人を選ぶ"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name="audience" value={v} checked={audience === v} onChange={() => setAudience(v)} />
              {l}
            </label>
          ))}
        </div>
        {audience === "store" && (
          <div className="flex flex-wrap gap-3 rounded-md bg-slate-50 p-3 text-sm">
            {stores.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="store_ids" value={o.id} defaultChecked={stores.length === 1} />
                {o.name}
              </label>
            ))}
          </div>
        )}
        {audience === "staff" && (
          <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
            {staff.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="staff_ids" value={o.id} />
                {o.name}
                <span className="text-xs text-slate-400">{o.store}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {mode === "notice" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">この日から出す</span>
            <input name="starts_on" type="date" defaultValue={today} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">この日まで（空なら、全員が確認するまで）</span>
            <input name="ends_on" type="date" className={input} />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">くり返し（その日だけ出します）</span>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="monthly">毎月</option>
              <option value="weekly">毎週</option>
              <option value="once">1回だけ</option>
            </select>
            {recurrence === "monthly" && (
              <select name="day_of_month" defaultValue="31" className="rounded-lg border border-slate-300 px-3 py-2">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d === 31 ? "末日" : `${d}日`}
                  </option>
                ))}
              </select>
            )}
            {recurrence === "weekly" && (
              <select name="day_of_week" defaultValue="3" className="rounded-lg border border-slate-300 px-3 py-2">
                {WEEK.map((w, i) => (
                  <option key={w} value={i}>
                    {w}曜日
                  </option>
                ))}
              </select>
            )}
            {recurrence === "once" && <input name="on_date" type="date" defaultValue={today} className="rounded-lg border border-slate-300 px-3 py-2" />}
          </div>
        </div>
      )}

      <button disabled={pending} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "保存しています…" : mode === "notice" ? "お知らせを出す" : "定期配信を作る"}
      </button>
      {state?.ok && <Toast key={state.at} message={state.ok} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}

export function ChecklistForm({ stores, canAll, action }: { stores: Option[]; canAll: boolean; action: (p: WbState, fd: FormData) => Promise<WbState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} key={state?.ok ? state.at : "form"} className="flex flex-wrap gap-2">
      <select name="store_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {canAll && <option value="">全店共通</option>}
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input name="label" maxLength={100} required placeholder="例：レジ締めをした" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        足す
      </button>
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </form>
  );
}

/** 押すとサーバーの処理を呼ぶだけの小さなボタン（止める・消すなど） */
export function ActButton({ label, act, confirmText, tone = "plain" }: { label: string; act: () => Promise<void>; confirmText?: string; tone?: "plain" | "danger" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => {
            try {
              await act();
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "できませんでした");
            }
          });
        }}
        className={`rounded-md px-2.5 py-1 text-xs font-bold ring-1 disabled:opacity-50 ${tone === "danger" ? "text-accent ring-accent/40" : "text-slate-600 ring-slate-300"}`}
      >
        {label}
      </button>
      {error && <span className="ml-2 text-xs text-accent">{error}</span>}
    </span>
  );
}
