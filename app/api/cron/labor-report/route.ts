import { NextResponse, type NextRequest } from "next/server";
import { buildCeoSummary, buildLaborReports } from "@/lib/labor-report";
import { pushLine } from "@/lib/line-push";
import { watchOvertime } from "@/lib/overtime-watch";

export const maxDuration = 60;

/**
 * 毎朝、各店の店長に「昨日の売上・人件費・人件費率」を、代表には全店まとめをLINEで送る（Vercel Cron）。
 * あわせて、36協定（残業 月45時間・年360時間）に近づいた人を店長と総務・代表に知らせる（2026-10-16）
 * 毎朝の AI の営業分析は止めた（2026-10-13 黒田さん「必要な時に設計する」）
 * ?dry=1 なら送らずに中身だけ返す。?only=ceo なら代表のまとめだけ
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
  // 36協定（残業 月45時間・年360時間）に近づいた人を、店長と総務・代表に知らせる
  const overtime = onlyCeo ? [] : await watchOvertime({ dry }).catch((e) => [{ error: String(e) }]);
  return NextResponse.json({ results, overtime });
}
