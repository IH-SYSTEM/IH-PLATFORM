import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { currentToken, storeForDisplay } from "@/lib/punch";

// 店舗の iPad が数秒ごとに呼ぶ。掲示キーが合えば、いま掲示すべきQRを返す（?fresh=1 は更新ボタン）
export async function GET(request: NextRequest, ctx: RouteContext<"/api/punch/display/[code]">) {
  const { code } = await ctx.params;
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const noStore = { "Cache-Control": "no-store" };

  try {
    const store = await storeForDisplay(code, key);
    if (!store) {
      return Response.json({ error: "この掲示ページのURLは無効です。管理画面の店舗設定から掲示用URLを確認してください" }, { status: 404, headers: noStore });
    }
    const { token, expiresAt } = await currentToken(store.id, request.nextUrl.searchParams.get("fresh") === "1");
    const url = `${request.nextUrl.origin}/punch/start?t=${token}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return Response.json({ store: { name: store.name, code: store.code }, token, expiresAt, svg }, { headers: noStore });
  } catch (e) {
    console.error("punch display failed", e);
    return Response.json({ error: "QRを用意できませんでした" }, { status: 500, headers: noStore });
  }
}
