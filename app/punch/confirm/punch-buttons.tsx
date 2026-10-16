"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { PunchResult } from "./actions";

type Action = (prev: PunchResult, fd: FormData) => Promise<PunchResult>;
type Notice = { id: string; title: string; body: string; importance: string };

const BREAKS = [0, 15, 30, 45, 60, 90, 120];
const MARK: Record<string, string> = { 重要: "🔴", 確認: "🟠", 指示: "🟡", お知らせ: "🟢", その他: "⚪" };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

/**
 * 打刻のボタン。ワークボードのお知らせ（出勤前・退勤前）を全部「確認しました」にし、
 * 退勤のときは退勤チェックリストに全部チェックを入れると、ボタンが押せるようになる
 */
export function PunchButtons({
  statusLabel,
  mode,
  checkIn,
  checkOut,
  notices,
  checklist,
  confirm,
  shift,
  overtimeCategories,
}: {
  statusLabel: string;
  mode: "check_in" | "check_out";
  checkIn: Action;
  checkOut: Action;
  notices: Notice[];
  checklist: { id: string; label: string }[];
  confirm: (noticeId: string) => Promise<{ ok: boolean; error?: string }>;
  shift: { text: string; noShift: boolean; checkInFrom: string | null; checkInFromText: string | null; overtimeFrom: string | null; shiftEndText: string | null };
  overtimeCategories: string[];
}) {
  const [state, formAction, pending] = useActionState(mode === "check_in" ? checkIn : checkOut, undefined);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();
  // 時刻で変わるもの（出勤できる時刻・残業の理由が要るか）は、画面を開いたままでも30秒ごとに見直す
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const tooEarly = mode === "check_in" && !!shift.checkInFrom && now < Date.parse(shift.checkInFrom);
  const needReason = mode === "check_out" && !!shift.overtimeFrom && now >= Date.parse(shift.overtimeFrom);
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const ready =
    notices.every((n) => confirmed.has(n.id)) &&
    (mode === "check_in" || checklist.every((c) => checked.has(c.id))) &&
    !tooEarly &&
    (!needReason || (!!category && !!reason.trim()));

  if (state?.ok) {
    return (
      <div className="mt-6 rounded-md bg-emerald-50 p-5">
        <p className="text-2xl font-bold text-emerald-700">{state.action === "check_in" ? "出勤しました" : "退勤しました"}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-emerald-800">{hhmm(state.at)}</p>
        <p className="mt-3 text-xs text-emerald-700">この画面は閉じてかまいません</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-4 text-left">
      <p className="text-center text-sm text-slate-500">{statusLabel}</p>
      <p className="pb-2 text-center text-sm font-bold text-slate-700">{shift.text}</p>
      {mode === "check_in" && shift.noShift && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">シフトがない日の出勤です。出勤すると、店長に確認の連絡が届きます</p>
      )}
      {tooEarly && <p className="rounded-md bg-slate-100 px-3 py-2 text-center text-sm font-bold text-slate-700">出勤は {shift.checkInFromText} から押せます</p>}
      {needReason && (
        <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">シフトの終わり（{shift.shiftEndText}）から15分以上たっています。残業の理由を入れてください</p>
          <select name="overtime_category" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base">
            <option value="" disabled>
              理由を選ぶ
            </option>
            {overtimeCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <textarea name="overtime_reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="くわしく（例：22時半の来店のお客様の対応）" className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base" />
          <p className="text-xs text-amber-800">店長が承認した分だけが、給与に入ります</p>
        </section>
      )}

      {notices.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">
            {mode === "check_in" ? "出勤前" : "退勤前"}のお知らせ（{[...confirmed].filter((id) => notices.some((n) => n.id === id)).length}/{notices.length}）
          </p>
          <p className="text-xs text-amber-800">全部読んで「確認しました」を押すと、{mode === "check_in" ? "出勤" : "退勤"}できます</p>
          <ul className="mt-3 space-y-2">
            {notices.map((n) => {
              const done = confirmed.has(n.id);
              return (
                <li key={n.id} className={`rounded-md border p-3 ${done ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-white"}`}>
                  <p className="font-bold text-slate-900">
                    {MARK[n.importance] ?? ""} <span className="text-xs text-slate-500">{n.importance}</span> {n.title}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                  {done ? (
                    <p className="mt-2 text-sm font-bold text-emerald-700">✓ 確認しました</p>
                  ) : (
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() =>
                        startConfirm(async () => {
                          const r = await confirm(n.id);
                          if (r.ok) setConfirmed((s) => new Set(s).add(n.id));
                          setConfirmError(r.ok ? null : (r.error ?? "記録できませんでした"));
                        })
                      }
                      className="mt-2 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      確認しました
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {confirmError && <p className="mt-2 text-sm font-bold text-accent">{confirmError}</p>}
        </section>
      )}

      {mode === "check_out" && checklist.length > 0 && (
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-slate-800">
            退勤チェックリスト（{checked.size}/{checklist.length}）
          </p>
          <ul className="mt-2 space-y-1">
            {checklist.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-md px-1 py-2 text-base">
                  <input
                    type="checkbox"
                    name="checklist"
                    value={c.id}
                    checked={checked.has(c.id)}
                    onChange={(e) =>
                      setChecked((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                    className="size-5"
                  />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode === "check_out" && (
        <label className="block text-sm text-slate-600">
          実際に取った休憩
          <select name="break_minutes" defaultValue="0" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base">
            {BREAKS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "休憩なし" : `${m}分`}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="submit"
        disabled={pending || !ready}
        className={`block w-full rounded-lg py-5 text-2xl font-bold text-white shadow-sm disabled:opacity-40 ${
          mode === "check_in" ? "bg-brand hover:bg-brand-2" : "bg-accent hover:bg-[#b8000a]"
        }`}
      >
        {pending ? "記録しています…" : mode === "check_in" ? "出勤する" : "退勤する"}
      </button>
      {!ready && !tooEarly && (
        <p className="text-center text-xs text-slate-500">{mode === "check_in" ? "お知らせを全部確認すると押せます" : needReason ? "お知らせ・チェックリスト・残業の理由を済ませると押せます" : "お知らせとチェックリストを済ませると押せます"}</p>
      )}
      {state && !state.ok && <p className="text-sm font-bold text-accent">{state.error}</p>}
    </form>
  );
}
