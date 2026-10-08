import { businessDayJST, monthRange } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";

// 急募の利用状況（今月）。乱用していないかを本部が見る
export async function UrgentUsage() {
  const { start, end } = monthRange(businessDayJST().slice(0, 7));
  const admin = createAdminClient();
  const { data: calls } = await admin.from("urgent_calls").select("store_id, reason, sent_count, created_by").gte("work_date", start).lte("work_date", end);
  if (!calls?.length) return null;
  const { data: stores } = await admin.from("stores").select("id, name").in("id", [...new Set(calls.map((c) => c.store_id))]);
  const byStore = new Map<string, { count: number; sent: number; reasons: Map<string, number> }>();
  for (const c of calls) {
    const s = byStore.get(c.store_id) ?? { count: 0, sent: 0, reasons: new Map() };
    s.count += 1;
    s.sent += c.sent_count;
    s.reasons.set(c.reason, (s.reasons.get(c.reason) ?? 0) + 1);
    byStore.set(c.store_id, s);
  }
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">急募の利用（今月）</h2>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {[...byStore.entries()].map(([id, s]) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-medium text-slate-800">{stores?.find((x) => x.id === id)?.name ?? "—"}</span>
            <span className="text-slate-600">
              {s.count}回（のべ{s.sent}名に送信）
              <span className="ml-2 text-xs text-slate-400">{[...s.reasons.entries()].map(([r, n]) => `${r} ${n}`).join("／")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
