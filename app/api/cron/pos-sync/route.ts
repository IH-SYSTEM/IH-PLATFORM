import { NextResponse, type NextRequest } from "next/server";
import { businessDayJST } from "@/lib/business-day";
import { AUTO_SOURCES, syncStore, type AutoCode } from "@/lib/pos/sync";

export const maxDuration = 60;

/**
 * 毎朝、自動で取り込める店（一鴻・COOKIE for MEN・COOKIE熊本）の直近7日分を取り込む（Vercel Cron）。
 * ?store=IKK などで1店だけ、?from=YYYY-MM-DD&to=YYYY-MM-DD で過去分もまとめて入れられる（最大62日）
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const today = businessDayJST();
  const to = sp.get("to") ?? new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? new Date(Date.parse(`${to}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const only = sp.get("store");
  const codes = (Object.keys(AUTO_SOURCES) as AutoCode[]).filter((c) => !only || c === only);
  const results = [];
  for (const code of codes) {
    const r = await syncStore(code, from, to);
    if ("error" in r) console.error("pos-sync", r);
    results.push(r);
  }
  return NextResponse.json({ from, to, results });
}
