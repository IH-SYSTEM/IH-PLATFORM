import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type StatusRow = {
  staff_id: string;
  has_account: boolean;
  password_set: boolean;
  invited_at: string | null;
  last_sign_in_at: string | null;
  firebase_last_sign_in_at: string | null;
};

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function daysAgo(iso: string, now: number) {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "今日" : `${d}日前`;
}

export default async function LoginStatusPage() {
  await requireAdmin();
  const { rows, now } = await loadLoginStatus();
  const active = rows.filter((r) => r.state !== "retired");
  const migrated = active.filter((r) => r.state === "migrated").length;

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-slate-900">ログイン状況</h1>
        <p className="mt-1 text-sm text-slate-500">
          新システムへの移行：在籍 {active.length} 名中 <span className="font-semibold text-emerald-700">{migrated} 名</span>
          が移行済み（未移行 {active.length - migrated} 名）
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">氏名</th>
                <th className="px-4 py-3 font-medium">所属</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">最終ログイン</th>
                <th className="px-4 py-3 font-medium">新システム</th>
                <th className="px-4 py-3 font-medium">旧システム</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.state === "retired" ? "text-slate-400" : ""}>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.storeName}</td>
                  <td className="px-4 py-3">
                    <StateBadge state={r.state} />
                  </td>
                  <td className="px-4 py-3">
                    {r.latest ? (
                      <>
                        {daysAgo(r.latest, now)}
                        <span className="ml-1.5 text-xs text-slate-400">{fmt.format(new Date(r.latest))}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">ログイン履歴なし</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.lastNew ? fmt.format(new Date(r.lastNew)) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.lastOld ? fmt.format(new Date(r.lastOld)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function loadLoginStatus() {
  const supabase = await createClient();
  const [{ data: statuses, error }, { data: staff }] = await Promise.all([
    supabase.rpc("staff_login_status"),
    supabase.from("staff").select("id, name, furigana, retired, stores(name)"),
  ]);
  if (error) throw new Error(error.message);

  const statusById = new Map((statuses as StatusRow[]).map((s) => [s.staff_id, s]));
  const now = Date.now();
  const rows = (staff ?? []).map((s) => {
    const st = statusById.get(s.id);
    const lastNew = st?.last_sign_in_at ?? null;
    const lastOld = st?.firebase_last_sign_in_at ?? null;
    const latest = [lastNew, lastOld].filter(Boolean).sort().at(-1) ?? null;
    const state = s.retired ? "retired" : st?.password_set ? "migrated" : st?.has_account ? "pending" : "none";
    const store = s.stores as unknown as { name: string } | null;
    return { ...s, storeName: store?.name ?? "—", lastNew, lastOld, latest, state };
  });
  const order = { pending: 0, none: 1, migrated: 2, retired: 3 } as const;
  rows.sort(
    (a, b) =>
      order[a.state as keyof typeof order] - order[b.state as keyof typeof order] ||
      (b.latest ?? "").localeCompare(a.latest ?? ""),
  );

  return { rows, now };
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    migrated: ["移行済み", "bg-emerald-50 text-emerald-700"],
    pending: ["未移行", "bg-amber-50 text-amber-700"],
    none: ["アカウントなし", "bg-red-50 text-red-700"],
    retired: ["退職", "bg-slate-100 text-slate-500"],
  };
  const [label, cls] = map[state];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}
