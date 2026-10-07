import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// punch … 打刻QRを読んだあとの本人確認。state の uid には打刻トークンを入れる
export type LineMode = "login" | "link" | "punch";

export function lineConfig() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  return channelId && channelSecret ? { channelId, channelSecret } : null;
}

// Cookie を使うと Safari のプライベートモードで失敗するため、HMAC 署名付き state で CSRF を防ぐ
export function signState(secret: string, mode: LineMode, uid: string) {
  const payload = `${randomUUID()}.${mode}.${Date.now()}.${uid}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyState(secret: string, state: string): { mode: LineMode; uid: string } | null {
  const parts = state.split(".");
  if (parts.length !== 5) return null;
  const [nonce, mode, ts, uid, mac] = parts;
  const expected = createHmac("sha256", secret).update(`${nonce}.${mode}.${ts}.${uid}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() - Number(ts) > 5 * 60 * 1000) return null;
  if (mode !== "login" && mode !== "link" && mode !== "punch") return null;
  return { mode, uid };
}

/** LINE の認可画面の URL。コールバックは既存の /api/auth/line-callback を共用する（LINE に登録済みのため） */
export function lineAuthorizeUrl(origin: string, config: { channelId: string; channelSecret: string }, mode: LineMode, uid: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.channelId,
    redirect_uri: `${origin}/api/auth/line-callback`,
    state: signState(config.channelSecret, mode, uid),
    scope: "profile",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

export const LINE_ERRORS: Record<string, string> = {
  line_cancelled: "LINEログインがキャンセルされました",
  invalid_request: "LINEログインのリクエストが不正です。もう一度お試しください",
  invalid_state: "時間切れか、不正なリクエストです。もう一度お試しください",
  token_failed: "LINEとの通信に失敗しました。もう一度お試しください",
  profile_failed: "LINEのプロフィールを取得できませんでした",
  not_linked: "このLINEアカウントは連携されていません。メールアドレスでログインし、「アカウント」からLINE連携をしてください",
  already_used: "このLINEアカウントは、すでに別のスタッフに連携されています",
  config_error: "LINEログインは現在準備中です。メールアドレスでログインしてください",
  session_failed: "ログインに失敗しました。もう一度お試しください",
  not_logged_in: "LINE連携にはログインが必要です",
};
