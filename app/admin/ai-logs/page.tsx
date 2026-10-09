import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";

export const metadata = { title: "AI取説の記録" };

const STATUS: Record<string, { label: string; tone: string }> = {
  answered: { label: "答えた", tone: "text-emerald-700" },
  unknown: { label: "答えられなかった", tone: "text-accent" },
  escalated: { label: "部署に振った", tone: "text-amber-700" },
  refused: { label: "権限外で断った", tone: "text-slate-500" },
  clarify: { label: "聞き返した", tone: "text-brand" },
  off_topic: { label: "関係ない質問", tone: "text-slate-400" },
  error: { label: "エラー", tone: "text-accent" },
};
const LEVEL: Record<string, string> = { staff: "一般", manager: "店長", admin: "本部" };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// AI取説で聞かれたことの記録。「答えられなかった」「部署に振った」質問が、説明書と機能を直す手がかり
export default async function AiLogsPage({ searchParams }: PageProps<"/admin/ai-logs">) {
  await requireAdmin();
  const { status, days: d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const since = daysAgo(days);
  const admin = createAdminClient();
  const modes = ["guide"]; // 壁打ち（代表だけ）の記録はここには出さない
  const [{ data: rows }, { data: staff }] = await Promise.all([
    admin.from("ai_messages").select("id, staff_id, level, question, answer, category, status, escalate_to, related_path, output_tokens, created_at").in("mode", modes).gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("staff").select("id, name"),
  ]);
  const all = rows ?? [];
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const count = <K extends string>(key: (r: (typeof all)[number]) => K | null) => {
    const m = new Map<string, number>();
    for (const r of all) {
      const k = key(r) ?? "（なし）";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byStatus = count((r) => r.status);
  const byCategory = count((r) => r.category);
  const byEscalate = count((r) => r.escalate_to).filter(([k]) => k !== "（なし）");
  const list = status ? all.filter((r) => r.status === status) : all.filter((r) => ["unknown", "escalated", "clarify", "error"].includes(r.status ?? ""));
  const q = (next: Record<string, string>) => `?${new URLSearchParams({ days: String(days), ...(status ? { status: String(status) } : {}), ...next })}`;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="AI取説の記録"
        description="スタッフがAI取説に聞いたことと答え。答えられなかった質問・部署に振った質問が、説明書と機能を直す手がかりです"
        actions={
          <div className="flex gap-1 text-sm">
            {[7, 30, 90].map((n) => (
              <Link key={n} href={q({ days: String(n) })} className={`rounded-full px-3 py-1.5 font-bold ${n === days ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                {n}日
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-md border border-line bg-white p-4">
          <p className="text-xs font-bold text-slate-500">質問の数（{days}日）</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{all.length}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {byStatus.map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <Link href={q({ status: k })} className={`hover:underline ${STATUS[k]?.tone ?? ""}`}>
                  {STATUS[k]?.label ?? k}
                </Link>
                <span className="tabular-nums">
                  {n}（{Math.round((n / Math.max(1, all.length)) * 100)}%）
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-md border border-line bg-white p-4">
          <p className="text-xs font-bold text-slate-500">話題</p>
          <ul className="mt-2 space-y-1 text-sm">
            {byCategory.map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
            {!byCategory.length && <li className="text-slate-400">まだありません</li>}
          </ul>
        </section>
        <section className="rounded-md border border-line bg-white p-4">
          <p className="text-xs font-bold text-slate-500">部署に振った先</p>
          <ul className="mt-2 space-y-1 text-sm">
            {byEscalate.map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
            {!byEscalate.length && <li className="text-slate-400">まだありません</li>}
          </ul>
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">{status ? `「${STATUS[String(status)]?.label ?? status}」の質問` : "見直したい質問（答えられなかった・振った・聞き返した）"}</h2>
          {status && (
            <Link href={q({ status: "" })} className="text-xs text-brand hover:underline">
              見直したい質問に戻る
            </Link>
          )}
        </div>
        <ul className="space-y-2">
          {list.slice(0, 200).map((r) => (
            <li key={r.id} className="rounded-md border border-line bg-white p-4 text-sm">
              <p className="text-xs text-slate-500">
                {when(r.created_at)}・{r.staff_id ? nameOf.get(r.staff_id) : "—"}（{LEVEL[r.level ?? ""] ?? "—"}）・{r.category ?? "—"}・
                <span className={`font-bold ${STATUS[r.status ?? ""]?.tone ?? ""}`}>{STATUS[r.status ?? ""]?.label ?? r.status ?? "—"}</span>
                {r.escalate_to && `→ ${r.escalate_to}`}
              </p>
              <p className="mt-1 font-bold text-slate-900">Q. {r.question}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500">答えを見る</summary>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.answer}</p>
              </details>
            </li>
          ))}
          {!list.length && <li className="rounded-md border border-line bg-white p-6 text-center text-sm text-slate-400">ありません</li>}
        </ul>
      </section>
    </div>
  );
}
