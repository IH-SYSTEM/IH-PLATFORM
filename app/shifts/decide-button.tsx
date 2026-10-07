"use client";

import { useTransition, useState } from "react";
import { decidePeriod } from "./actions";

export function DecideButton({ storeId, type, start, decidedAt, label }: { storeId: string; type: "week" | "month"; start: string; decidedAt: string | null; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const when = decidedAt ? new Date(decidedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="mt-2">
      {when ? (
        <p className="text-xs font-bold text-emerald-700">確定済み（{when}）。この後の変更も、すぐスタッフに反映されます</p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`${label}します。スタッフのマイページに表示されるようになります。よろしいですか？`)) return;
            startTransition(async () => {
              const r = await decidePeriod(storeId, type, start);
              setError(r?.error ?? null);
            });
          }}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-2 disabled:opacity-60"
        >
          {pending ? "確定しています…" : label}
        </button>
      )}
      {error && <p className="mt-1 text-xs font-bold text-accent">{error}</p>}
    </div>
  );
}
