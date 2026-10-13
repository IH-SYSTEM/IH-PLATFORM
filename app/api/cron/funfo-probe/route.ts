import { NextResponse, type NextRequest } from "next/server";
import { funfoPost, funfoToken, shape } from "@/lib/pos/funfo";

/**
 * FUNFO とつながるかを確かめる（調べる用。CRON_SECRET が必要）。トークンや金額の値は返さず、結果の形と件数だけを返す。
 * ?date=2026-10-12&store=…&user=…
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = request.nextUrl.searchParams;
  const date = q.get("date") ?? new Date(Date.now() - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
  const store = q.get("store") ?? "obanzai@ikkou-e.com";
  const user = q.get("user") ?? store;

  const t = await funfoToken();
  const token = { ok: !!t.token, error: t.error, retCode: t.raw?.retCode, retMsg: t.raw?.retMsg, shape: shape(t.raw) };
  if (!t.token) return NextResponse.json({ token });

  const sale = await funfoPost("/clientApi/statistics/v2/store/sale/data", { orderDate: date, orderType: 7, storeEmails: [store], userEmail: user });
  const data = sale.json.data as { amountHours?: { personNum?: string; realTaxAmount?: string }[] } | undefined;
  return NextResponse.json({
    token,
    sale: {
      status: sale.status,
      retCode: sale.json.retCode,
      retMsg: sale.json.retMsg,
      shape: shape(sale.json),
      // 中身が取れているかだけ：客数と、売上が0より大きいか
      check: data?.amountHours?.map((h) => ({ persons: h.personNum, hasSales: Number(h.realTaxAmount ?? 0) > 0 })),
    },
  });
}
