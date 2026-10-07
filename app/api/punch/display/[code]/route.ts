import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { currentToken, distanceMeters, storeForDisplay } from "@/lib/punch";

// 店舗の iPad が数秒ごとに呼ぶ。掲示キーが合い、iPad が店舗の近くにあれば、いま掲示すべきQRを返す
//   ?lat=&lng=&acc= … iPad の現在地（acc は精度 m）
//   ?fresh=1       … 更新ボタン
// 位置は端末から送られてくる値なので偽装は防げない。店外にURLが漏れたときにそのまま使われるのを防ぐための確認
export async function GET(request: NextRequest, ctx: RouteContext<"/api/punch/display/[code]">) {
  const { code } = await ctx.params;
  const q = request.nextUrl.searchParams;
  const noStore = { "Cache-Control": "no-store" };
  const deny = (reason: string, error: string, extra: Record<string, unknown> = {}, status = 403) =>
    Response.json({ reason, error, ...extra }, { status, headers: noStore });

  try {
    const store = await storeForDisplay(code, q.get("key") ?? "");
    if (!store) {
      return deny("invalid_url", "この掲示ページのURLは無効です。管理画面の店舗設定から掲示用URLを確認してください", {}, 404);
    }
    const head = { store: { name: store.name, code: store.code }, radius: store.radius };

    // 店舗の位置が未登録なら、近くにいるかを確かめられないので表示しない
    if (store.lat === null || store.lng === null) {
      return deny("no_store_location", "店舗の位置（緯度・経度）が未登録のため、QRを表示できません。管理画面の店舗設定で登録してください", head);
    }
    const lat = Number(q.get("lat"));
    const lng = Number(q.get("lng"));
    if (!q.get("lat") || !q.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return deny("need_location", "この端末の位置情報を確認しています…", head);
    }
    const distance = Math.round(distanceMeters(store.lat, store.lng, lat, lng));
    if (distance > store.radius) {
      const acc = Number(q.get("acc"));
      return deny("too_far", `お店から約${distance}m離れているため、QRを表示できません（表示できるのは${store.radius}m以内）`, {
        ...head,
        distance,
        accuracy: Number.isFinite(acc) ? Math.round(acc) : null,
      });
    }

    const { token, expiresAt } = await currentToken(store.id, q.get("fresh") === "1");
    const url = `${request.nextUrl.origin}/punch/start?t=${token}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return Response.json({ ...head, token, expiresAt, svg, distance }, { headers: noStore });
  } catch (e) {
    console.error("punch display failed", e);
    return Response.json({ reason: "server", error: "QRを用意できませんでした" }, { status: 500, headers: noStore });
  }
}
