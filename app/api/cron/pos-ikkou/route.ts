import { NextResponse, type NextRequest } from "next/server";
import { businessDayJST } from "@/lib/business-day";
import { fetchIkkou } from "@/lib/pos/ikkou";
import { savePosReceipts } from "@/lib/pos/save";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 毎朝、一鴻のレジの直近7日分を取り込む（Vercel Cron）。同じ会計は上書きなので、毎回7日分を読み直しても二重にならない。
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD で過去分をまとめて入れることもできる（最大62日）
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const today = businessDayJST();
  const to = sp.get("to") ?? new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? new Date(Date.parse(`${to}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").eq("code", "IKK").single();
  if (!store) return NextResponse.json({ error: "一鴻の店舗（IKK）がありません" }, { status: 500 });
  const { receipts, raw, error } = await fetchIkkou(from, to);
  if (error) {
    console.error("pos-ikkou", error);
    return NextResponse.json({ error }, { status: 502 });
  }
  if (!receipts.length) return NextResponse.json({ ok: true, from, to, receipts: 0 });
  const saved = await savePosReceipts(admin, { storeId: store.id, source: "ikkou", fileName: `ikkou_${from}_${to}.json`, file: Buffer.from(raw), receipts, importedBy: null });
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true, from, to, receipts: receipts.length, total: saved.total });
}
