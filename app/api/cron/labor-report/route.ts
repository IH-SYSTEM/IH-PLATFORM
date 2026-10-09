import { NextResponse, type NextRequest } from "next/server";
import { buildCeoSummary, buildLaborReports } from "@/lib/labor-report";
import { buildDailyAnalysis } from "@/lib/ai-guide/daily-analysis";
import { pushLine } from "@/lib/line-push";

export const maxDuration = 300;

/**
 * 毎朝、各店の店長に「昨日の売上・人件費・人件費率」を、代表には全店まとめをLINEで送る（Vercel Cron）。
 * 代表にはまとめのあとに、AI の営業分析（壁打ちと同じ前提）も送る。分析に失敗しても、まとめは送る。
 * ?dry=1 なら送らずに中身だけ返す。?only=ceo なら代表のまとめと分析だけ
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const onlyCeo = request.nextUrl.searchParams.get("only") === "ceo";
  const reports = onlyCeo ? [] : await buildLaborReports({ preview: dry });
  const results = [];
  for (const r of reports) {
    const sent = dry ? { sent: 0, skipped: "dry" } : await pushLine(r.to, r.text, "labor_report");
    results.push({ store: r.storeName, to: r.names, ...sent, ...(dry ? { text: r.text } : {}) });
  }
  const ceo = await buildCeoSummary();
  const ceoSent = dry || !ceo.to ? { sent: 0, skipped: dry ? "dry" : "代表のLINEが未連携" } : await pushLine([ceo.to], ceo.text, "labor_report");
  results.push({ store: "全店まとめ（代表）", ...ceoSent, ...(dry ? { text: ceo.text } : {}) });
  try {
    const analysis = await buildDailyAnalysis(ceo.text);
    const sent = dry || !ceo.to ? { sent: 0, skipped: dry ? "dry" : "代表のLINEが未連携" } : await pushLine([ceo.to], analysis, "labor_report");
    results.push({ store: "営業分析（代表）", ...sent, ...(dry ? { text: analysis } : {}) });
  } catch (e) {
    results.push({ store: "営業分析（代表）", sent: 0, error: e instanceof Error ? e.message : String(e) });
  }
  return NextResponse.json({ results });
}
