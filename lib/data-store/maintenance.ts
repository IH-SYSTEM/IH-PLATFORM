import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 利用データ保管庫の整理（月1回・毎月1日の朝の自動処理と、画面の「今すぐ整理する」）。2026-10-14 黒田さん決定：画面に残すだけ（LINE は送らない）。
 *   ① 似たカテゴリをまとめる（AI が判断。まとめた元は merged_into に残し、データは新しいほうへ移す）
 *   ② 同じデータが2回入っていないか（同じカテゴリ・同じ期間・同じ列）を見つける
 *   ③ 足りない期間（店の売上が1日もない月）を見つける
 *   ④ 読めなかった・確かめ待ちのものを数える
 * 結果は data_maintenance_runs に残し、保管庫の画面に出す
 */
const client = new Anthropic();

export async function runMaintenance(): Promise<{ summary: string }> {
  const admin = createAdminClient();
  const actions: { type: string; detail: string }[] = [];

  // ① カテゴリをまとめる
  const [{ data: cats }, { data: sets }] = await Promise.all([
    admin.from("data_categories").select("id, name, description").is("merged_into", null).order("name"),
    admin.from("datasets").select("id, category_id, title, period_from, period_to, row_count, schema, status, kind"),
  ]);
  const countOf = (id: string) => (sets ?? []).filter((s) => s.category_id === id).length;
  if ((cats ?? []).length >= 2) {
    const list = (cats ?? []).map((c) => `${c.name}（${countOf(c.id)}件${c.description ? `・${c.description}` : ""}）`).join("\n");
    try {
      const res = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: `会社の利用データ保管庫のカテゴリの一覧です。意味が同じ・ほとんど同じものだけをまとめてください（違うものは無理にまとめない）。
${list}

JSON だけを返す：{"merge": [{"from": "まとめる元の名前", "into": "まとめる先の名前（一覧にある名前）"}]}。まとめるものがなければ {"merge": []}`,
          },
        ],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { merge?: { from: string; into: string }[] };
      for (const m of json.merge ?? []) {
        const from = (cats ?? []).find((c) => c.name === m.from);
        const into = (cats ?? []).find((c) => c.name === m.into);
        if (!from || !into || from.id === into.id) continue;
        await admin.from("datasets").update({ category_id: into.id }).eq("category_id", from.id);
        await admin.from("data_categories").update({ merged_into: into.id, updated_at: new Date().toISOString() }).eq("id", from.id);
        actions.push({ type: "merge", detail: `カテゴリ「${from.name}」を「${into.name}」にまとめました` });
      }
    } catch (e) {
      console.error("maintenance merge failed", e);
    }
  }

  // ② 同じデータの重複（同じカテゴリ・同じ期間・同じ列・同じ行数）
  const seen = new Map<string, string>();
  for (const s of sets ?? []) {
    if (s.kind === "document" || !s.period_from) continue;
    const key = `${s.category_id}|${s.period_from}|${s.period_to}|${JSON.stringify((s.schema as { label: string }[]).map((c) => c.label))}|${s.row_count}`;
    const prev = seen.get(key);
    if (prev) actions.push({ type: "duplicate", detail: `「${s.title}」と「${prev}」は同じデータかもしれません（同じ期間・同じ列・同じ行数）` });
    else seen.set(key, s.title);
  }

  // ③ 足りない期間：売上を集めている店で、直近12か月に1日も売上がない月
  const { data: stores } = await admin.from("stores").select("id, name").eq("is_active", true);
  const now = new Date(Date.now() + 9 * 3_600_000);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1)).toISOString().slice(0, 7));
  const { data: daily } = await admin.from("pos_daily").select("store_id, business_date").gte("business_date", `${months[0]}-01`).limit(50000);
  for (const st of stores ?? []) {
    const mine = new Set((daily ?? []).filter((d) => d.store_id === st.id).map((d) => d.business_date.slice(0, 7)));
    if (!mine.size) continue; // 売上を集めていない店（本部など）
    const first = [...mine].sort()[0];
    const missing = months.filter((m) => m >= first && !mine.has(m));
    if (missing.length) actions.push({ type: "gap", detail: `${st.name}：${missing.map((m) => `${Number(m.slice(5))}月`).join("・")}の売上がありません（${missing[0].slice(0, 4)}年〜）` });
  }

  // ④ 読めなかった・確かめ待ち
  const errors = (sets ?? []).filter((s) => s.status === "error").length;
  const reviews = (sets ?? []).filter((s) => s.status === "needs_review").length;
  if (errors) actions.push({ type: "error", detail: `読めなかったデータが${errors}件あります` });
  if (reviews) actions.push({ type: "review", detail: `確かめ待ちのデータが${reviews}件あります（店の選択・決算の数字の確認）` });

  const active = (cats ?? []).length - actions.filter((a) => a.type === "merge").length;
  const summary = `データ ${(sets ?? []).length}件・カテゴリ ${active}個。${actions.length ? `気づいたこと ${actions.length}件。` : "気になるところはありません。"}`;
  await admin.from("data_maintenance_runs").insert({ summary, actions });
  return { summary };
}

/** 壁打ちに渡す「データ目録」（カテゴリ → データの名前・期間・行数・月ごとの合計）と、決算の数字 */
export async function dataCatalogContext(): Promise<string> {
  const admin = createAdminClient();
  const [{ data: cats }, { data: sets }, { data: fin }, { data: companies }] = await Promise.all([
    admin.from("data_categories").select("id, name").is("merged_into", null).order("name"),
    admin.from("datasets").select("category_id, title, description, period_from, period_to, row_count, stats, status, kind").in("status", ["ready", "needs_review"]).neq("kind", "document").order("period_to", { ascending: false, nullsFirst: false }).limit(150),
    admin.from("financial_statements").select("company_id, period_end, fiscal_label, revenue, gross_profit, operating_income, ordinary_income, net_income, total_assets, net_assets, borrowings, cash, approved").order("period_end"),
    admin.from("companies").select("id, name"),
  ]);
  const cname = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const yen = (v: number | null) => (v === null ? "—" : `${Math.round(v / 10000).toLocaleString()}万円`);
  const finText = (fin ?? []).length
    ? (fin ?? [])
        .map(
          (f) =>
            `- ${cname.get(f.company_id)} ${f.fiscal_label ?? ""}（${f.period_end}期末）${f.approved ? "" : "【未確認：AIの読み取り】"}：売上高 ${yen(f.revenue)}・売上総利益 ${yen(f.gross_profit)}・営業利益 ${yen(f.operating_income)}・経常利益 ${yen(f.ordinary_income)}・当期純利益 ${yen(f.net_income)}・総資産 ${yen(f.total_assets)}・純資産 ${yen(f.net_assets)}・借入金 ${yen(f.borrowings)}・現預金 ${yen(f.cash)}`,
        )
        .join("\n")
    : "（まだありません）";
  const catText = (cats ?? [])
    .map((c) => {
      const mine = (sets ?? []).filter((s) => s.category_id === c.id);
      if (!mine.length) return "";
      return `### ${c.name}\n${mine
        .map((s) => {
          const monthly = (s.stats as { monthly?: Record<string, Record<string, number>> } | null)?.monthly;
          const m = monthly
            ? Object.entries(monthly)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-24)
                .map(([k, v]) => `${k}: ${Object.entries(v).map(([kk, vv]) => `${kk} ${Math.round(vv).toLocaleString()}`).join("・")}`)
                .join(" ／ ")
            : "";
          return `- ${s.title}（${s.period_from ?? "?"}〜${s.period_to ?? "?"}・${s.row_count}行${s.status === "needs_review" ? "・確かめ待ち" : ""}）：${(s.description ?? "").replace(/\s+/g, " ").slice(0, 300)}${m ? `\n  月ごと：${m.slice(0, 1500)}` : ""}`;
        })
        .join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
  return `## 利用データ保管庫（AIが表に起こしたデータ）\n### 決算の数字\n${finText}\n\n${catText || "（表のデータはまだありません）"}`;
}
