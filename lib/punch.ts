import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { lineConfig } from "@/lib/line-login";
import { businessDayJST } from "@/lib/business-day";

// 掲示しているQRの有効期限。1人が読み取って LINE で本人確定した時点でも次のQRに切り替わる
export const TOKEN_TTL_MS = 5 * 60 * 1000;
// LINE で本人確定してから打刻ボタンを押すまでの猶予。掲示の5分とは別に数える
export const GRACE_MS = 15 * 60 * 1000;
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

/**
 * LINE で本人が確定した時点でトークンを押さえる。未使用・期限内の行だけを条件付きで更新するので、
 * 同じQRを2人が同時に読んでも、先に更新できた1人だけが true になる。この瞬間に掲示のQRが次へ切り替わる
 */
export async function claimToken(token: string, staffId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await createAdminClient()
    .from("punch_tokens")
    .update({ claimed_at: now, claimed_by: staffId })
    .eq("token", token)
    .is("claimed_at", null)
    .gt("expires_at", now)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export type PunchAction = "check_in" | "check_out";

/** 打刻で使い切る。押さえた本人・未使用・猶予内をまとめて条件にする。使い切れたらトークンの行を返す */
export async function consumeToken(token: string, staffId: string, action: PunchAction) {
  const { data } = await createAdminClient()
    .from("punch_tokens")
    .update({ consumed_at: new Date().toISOString(), action })
    .eq("token", token)
    .eq("claimed_by", staffId)
    .is("consumed_at", null)
    .gt("claimed_at", new Date(Date.now() - GRACE_MS).toISOString())
    .select("id, store_id");
  return data?.[0] ?? null;
}

// ===== 打刻チケット =====
// LINE で本人確認したあと、確認画面に渡す署名付きの札（トークン・スタッフ・期限）。
// QRの写真だけを持っている人が、確認画面を直接開いて他人の打刻をするのを防ぐ
function ticketSecret() {
  const config = lineConfig();
  if (!config) throw new Error("LINE login is not configured");
  return `punch-ticket:${config.channelSecret}`;
}

export function signTicket(token: string, staffId: string) {
  const payload = `${token}.${staffId}.${Date.now() + GRACE_MS}`;
  return `${payload}.${createHmac("sha256", ticketSecret()).update(payload).digest("base64url")}`;
}

export function verifyTicket(ticket: string): { token: string; staffId: string } | null {
  const parts = ticket.split(".");
  if (parts.length !== 4) return null;
  const [token, staffId, exp, mac] = parts;
  const expected = createHmac("sha256", ticketSecret()).update(`${token}.${staffId}.${exp}`).digest("base64url");
  if (!sameSecret(mac, expected)) return null;
  if (Date.now() > Number(exp)) return null;
  return { token, staffId };
}

// ===== 打刻の状態 =====
export type PunchStatus =
  | { kind: "before_checkin" }
  | { kind: "working"; attendanceId: string; checkinTime: string }
  | { kind: "done"; checkinTime: string; checkoutTime: string };

/**
 * いまの打刻状態。退勤していない出勤が直近24時間にあれば勤務中（営業日をまたいで朝5時を過ぎても退勤できるように）。
 * なければ、今日の営業日に退勤まで済んでいれば済み、どちらでもなければ出勤前
 */
export async function punchStatus(staffId: string, now = new Date()): Promise<PunchStatus> {
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("attendance")
    .select("id, checkin_time")
    .eq("staff_id", staffId)
    .is("checkout_time", null)
    .not("checkin_time", "is", null)
    .gt("checkin_time", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .order("checkin_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return { kind: "working", attendanceId: open.id, checkinTime: open.checkin_time };

  const { data: today } = await admin
    .from("attendance")
    .select("checkin_time, checkout_time")
    .eq("staff_id", staffId)
    .eq("date", businessDayJST(now))
    .maybeSingle();
  if (today?.checkin_time && today.checkout_time) {
    return { kind: "done", checkinTime: today.checkin_time, checkoutTime: today.checkout_time };
  }
  return { kind: "before_checkin" };
}
