import { NextResponse, type NextRequest } from "next/server";
import { buildLaborReports } from "@/lib/labor-report";
import { pushLine } from "@/lib/line-push";

export const maxDuration = 60;

/** 毎朝、各店の店長に「昨日の売上・人件費・人件費率」をLINEで送る（Vercel Cron）。?dry=1 なら送らずに中身だけ返す */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const reports = await buildLaborReports({ preview: dry });
  const results = [];
  for (const r of reports) {
    const sent = dry ? { sent: 0, skipped: "dry" } : await pushLine(r.to, r.text, "labor_report");
    results.push({ store: r.storeName, to: r.names, ...sent, ...(dry ? { text: r.text } : {}) });
  }
  return NextResponse.json({ results });
}
