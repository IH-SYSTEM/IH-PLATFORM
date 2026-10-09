import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { businessDayJST } from "@/lib/business-day";
import { laborByStoreDay } from "@/lib/labor-cost";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPARRING_SYSTEM, sparringContext } from "@/lib/ai-guide/sparring";

const client = new Anthropic();
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 店ごとの直近14日（日別の売上・客数・人件費）。前の週の同じ曜日と比べられるように */
async function recentDays(): Promise<string> {
  const admin = createAdminClient();
  const day = new Date(Date.parse(`${businessDayJST()}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${day}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: stores }, { data: rows }, labor] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_daily").select("store_id, business_date, sales, people").gte("business_date", from).lte("business_date", day).order("business_date").limit(5000),
    laborByStoreDay(from, day),
  ]);
  const out: string[] = [];
  for (const s of stores ?? []) {
    const mine = (rows ?? []).filter((r) => r.store_id === s.id);
    if (!mine.length) continue;
    out.push(`### ${s.name}`);
    for (const r of mine) {
      const l = labor.get(`${s.id}:${r.business_date}`);
      const w = WEEK[new Date(`${r.business_date}T12:00:00Z`).getUTCDay()];
      out.push(`${r.business_date.slice(5)}（${w}）売上 ${Number(r.sales).toLocaleString()}円・客数 ${r.people}人・人件費 ${l?.hasAttendance ? `${Math.round(l.cost).toLocaleString()}円` : "勤怠なし"}`);
    }
  }
  return out.join("\n") || "（データなし）";
}

/**
 * 代表に毎朝送る「営業分析」（2026-10-10 黒田さん要望）。壁打ちと同じ前提（3手先まで・コンセプト帳を崩さない）で、
 * 昨日と今月の数字から気づきを短く書く。LINE で読むので、記号の見出しや表は使わない
 */
export async function buildDailyAnalysis(summary: string): Promise<string> {
  const [context, days] = await Promise.all([sparringContext(), recentDays()]);
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: SPARRING_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: `${context}\n\n## 直近14日（店別・日別）\n${days}` },
    ],
    messages: [
      {
        role: "user",
        content: `毎朝LINEで届く「営業分析」を書いてください。今朝の全店まとめはこれです。\n\n${summary}\n\n書き方：
- 冒頭は「【営業分析】」の1行
- 気づきを多くても3つ。それぞれ「何が起きたか（数字）→ なぜか（考えられる理由。推測なら推測と書く）→ どう見るか」を2〜3行で。前の週の同じ曜日・月の目標・コンセプト帳と照らす
- 目立つ変化がない店は書かない。何もなければ「大きな変化はありません」でよい
- 最後に「次の一手」を1つだけ（誰が・何を・いつまでに）
- 全体で500字くらいまで。LINEで読むので、#・*・表・箇条の記号は使わず、ふつうの文と改行で
- 人件費率がデモデータの注意書きの対象なら、人件費率には触れず売上・客数・客単価だけで見る`,
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  return `${text}\n\n続きは IH ポータル → AI取説 → 壁打ち`;
}
