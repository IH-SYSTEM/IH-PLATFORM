import { NextResponse, type NextRequest } from "next/server";
import { sendShiftNotices } from "@/lib/shift-notices";

export const maxDuration = 60;

/**
 * 毎日12時（日本時間）に、シフトの提出期限・確定日の LINE を送る（Vercel Cron）。lib/shift-notices.ts
 * ?dry=1 なら送らずに中身だけ返す。dry のときだけ &date=YYYY-MM-DD でその日の分を確かめられる
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const date = request.nextUrl.searchParams.get("date");
  const results = await sendShiftNotices({ dry, origin: request.nextUrl.origin, date: dry && date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined });
  return NextResponse.json({ count: results.length, results });
}
