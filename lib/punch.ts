import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// 掲示しているQRの有効期限。1人が読み取って LINE で本人確定した時点でも次のQRに切り替わる
export const TOKEN_TTL_MS = 5 * 60 * 1000;
// 期限ぎりぎりのQRを読ませないよう、残りがこれより短ければ新しいQRを出す
const REISSUE_MARGIN_MS = 30 * 1000;

export const STORE_CODE = /^[A-Z]{2,4}$/;

export const newDisplayKey = () => randomBytes(24).toString("base64url");

/** 店舗の iPad で開く掲示ページの URL */
export const displayUrl = (origin: string, code: string, key: string) =>
  `${origin}/punch/display/${code}?key=${encodeURIComponent(key)}`;
const newToken = () => randomBytes(24).toString("base64url");

function sameSecret(input: string, stored: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 掲示用の iPad は店舗からこの距離（m）以内でないとQRを出さない。店舗ごとの「打刻可能範囲」が未設定のときの値
export const DEFAULT_DISPLAY_RADIUS_M = 50;

export type DisplayStore = { id: string; name: string; code: string; lat: number | null; lng: number | null; radius: number };

/** 店舗コードと掲示キーが一致した店舗。どちらが違っても null（どちらが違うかは返さない） */
export async function storeForDisplay(code: string, key: string): Promise<DisplayStore | null> {
  if (!STORE_CODE.test(code) || !key) return null;
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, code, is_active, lat, lng, geofence_radius")
    .eq("code", code)
    .maybeSingle();
  if (!store?.is_active) return null;
  const { data: row } = await admin.from("store_display_keys").select("display_key").eq("store_id", store.id).maybeSingle();
  if (!row || !sameSecret(key, row.display_key)) return null;
  return {
    id: store.id,
    name: store.name,
    code: store.code,
    lat: store.lat,
    lng: store.lng,
    radius: store.geofence_radius ?? DEFAULT_DISPLAY_RADIUS_M,
  };
}

/** 2点間の距離（m）。数十m の判定に使うので球面近似で足りる */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * 掲示中のQRのトークン。まだ誰も使っておらず期限に余裕があれば同じものを返し、なければ新しく発行する。
 * fresh のときは掲示中のQRを失効させてから発行し直す（掲示ページの更新ボタン）
 */
export async function currentToken(storeId: string, fresh = false): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  if (fresh) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("punch_tokens")
      .update({ expires_at: now })
      .eq("store_id", storeId)
      .is("claimed_at", null)
      .gt("expires_at", now);
    if (error) throw new Error(error.message);
  }
  const { data: open } = await admin
    .from("punch_tokens")
    .select("token, expires_at")
    .eq("store_id", storeId)
    .is("claimed_at", null)
    .gt("expires_at", new Date(Date.now() + REISSUE_MARGIN_MS).toISOString())
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return { token: open.token, expiresAt: open.expires_at };

  const row = { token: newToken(), store_id: storeId, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() };
  const { error } = await admin.from("punch_tokens").insert(row);
  if (error) throw new Error(error.message);
  return { token: row.token, expiresAt: row.expires_at };
}

/** QRを読み取ったときの確認。まだ誰も使っておらず期限内なら、そのトークンの店舗を返す */
export async function openTokenStore(token: string): Promise<{ id: string; name: string } | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("punch_tokens")
    .select("store_id")
    .eq("token", token)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const { data: store } = await admin.from("stores").select("id, name").eq("id", data.store_id).single();
  return store;
}
