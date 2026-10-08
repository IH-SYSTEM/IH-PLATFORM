import "server-only";
import { businessDayJST } from "@/lib/business-day";
import { laborByStoreDay } from "@/lib/labor-cost";
import { createAdminClient } from "@/lib/supabase/admin";

/** 壁打ちの決まった前提（毎回同じ・キャッシュが効く部分） */
export const SPARRING_SYSTEM = `あなたは株式会社一鴻ホールディングスの代表（黒田学さん）の「壁打ち相手」です。経営の考えを一緒に整理し、次の一手を決める手伝いをします。

守ること：
1. 提案するときは必ず「1手目：直接の効果 → 2手目：お客さん・スタッフ・現場の反応 → 3手目：店のコンセプト・客層・収益構造への影響」まで考えてから出す。1手目の効果だけで提案しない。
2. 下の「コンセプト帳」に書かれた柱は、黒田さんが確定したもの。提案や黒田さんの案がどれかの柱とぶつかるときは、必ず「この案は【柱の名前】とぶつかります。理由は…」とはっきり伝え、柱を壊さない別の方法を出す。柱そのものを変えたいのかどうかは、黒田さんに確かめる。
3. 現場で実際にやるのは誰か（アルバイトだけの店、手一杯の担当者など）まで考える。
4. 数字は「今の数字」にあるものだけを使う。ないものは推測で作らず「この数字が必要です」と言う。税込・税抜、営業利益・本部費の前後など、基準を明示する。
5. 一度に宿題を積まない。最後は必ず「次の一手」を1つだけ、具体的に（誰が・何を・いつまでに）示す。
6. 頭の中を外に出す手伝いをする。黒田さんの話が散らかっていたら、要点を短くまとめ直してから考える。必要なら質問を1つだけ返す。
7. 話し方はふつうの日本語で、結論から。長くなりすぎない。`;

/** コンセプト帳（DB）と今の数字（店舗別の今月・先月）。毎回変わるので、キャッシュの後ろに置く */
export async function sparringContext(): Promise<string> {
  const admin = createAdminClient();
  const today = businessDayJST();
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const lastMonth = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const from = `${lastMonth}-01`;

  const [{ data: concepts }, { data: stores }, { data: days }, { count: demo }, labor] = await Promise.all([
    admin.from("ceo_concepts").select("scope, title, body").eq("is_active", true).order("sort_order").order("updated_at"),
    admin.from("stores").select("id, name, target_labor_cost_rate, sales_source").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("pos_daily").select("store_id, business_date, sales, people").gte("business_date", from).lte("business_date", yesterday).limit(20000),
    admin.from("attendance").select("id", { count: "exact", head: true }).eq("source", "demo"),
    laborByStoreDay(from, yesterday),
  ]);

  const book = (concepts ?? []).length
    ? (concepts ?? []).map((c) => `### 【${c.scope}】${c.title}\n${c.body}`).join("\n\n")
    : "（まだ登録がありません）";

  const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
  const lines: string[] = [];
  for (const s of stores ?? []) {
    for (const ym of [lastMonth, thisMonth]) {
      const rows = (days ?? []).filter((d) => d.store_id === s.id && d.business_date.startsWith(ym));
      if (!rows.length) continue;
      const sales = rows.reduce((a, r) => a + Number(r.sales), 0);
      const people = rows.reduce((a, r) => a + Number(r.people), 0);
      const withAtt = rows.filter((r) => labor.get(`${s.id}:${r.business_date}`)?.hasAttendance);
      const lCost = withAtt.reduce((a, r) => a + (labor.get(`${s.id}:${r.business_date}`)?.cost ?? 0), 0);
      const lSales = withAtt.reduce((a, r) => a + Number(r.sales), 0);
      const rate = withAtt.length && lSales ? `人件費率 ${Math.round((lCost / lSales) * 1000) / 10}%（勤怠のある${withAtt.length}日）` : "人件費率 —（勤怠データなし）";
      const target = s.target_labor_cost_rate ? `・目標 ${Math.round(Number(s.target_labor_cost_rate) * 100)}%` : "";
      lines.push(`- ${s.name} ${ym}${ym === thisMonth ? `（${yesterday.slice(5)}まで）` : ""}：売上 ${yen(sales)}（税込）・${rows.length}営業日・客数 ${people}人・客単価 ${yen(sales / Math.max(1, people))}・${rate}${target}${s.sales_source === "crm" ? "・売上はCRMの来店記録" : ""}`);
    }
  }
  const caveat = demo ? "\n※勤怠に試験用の偽データ（デモ）が入っているため、今の人件費率は実態ではありません。人件費率をもとにした判断はしないでください。" : "";

  return `## コンセプト帳（黒田さんが確定した柱。崩さないこと）\n${book}\n\n## 今の数字（IH-PLATFORM、${today} 時点）\n${lines.join("\n") || "（データなし）"}${caveat}\n人件費＝アルバイトは勤怠×時給の実数、正社員は（月給＋固定手当＋会社負担の法定福利費）÷営業日。会社負担の法定福利費を含む。`;
}
