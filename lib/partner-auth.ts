import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 取引先（銀行）のログイン（2026-10-13）。社員のログイン（Supabase）とは別の仕組み。
 * パスワード（scrypt）→ メールの6桁コード → ログイン中のクッキー（乱数。DB にはハッシュ）。8時間で切れる。
 * 有効期限が過ぎた・止められた担当者は、ログイン中でもすぐ入れなくなる
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const PARTNER_COOKIE = "ih_partner";
const SESSION_HOURS = 8;
const CODE_MINUTES = 10;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(pw: string, stored: string) {
  const [alg, s, k] = stored.split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const want = Buffer.from(k, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** 初めのパスワード（読み間違えやすい字を除いた12文字） */
export function newPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

const today = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

async function clientInfo() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function logPartner(e: { partnerId: string | null; userId: string | null; action: string; target?: string | null }) {
  await createAdminClient().from("partner_access_logs").insert({ partner_id: e.partnerId, user_id: e.userId, action: e.action, target: e.target ?? null, ...(await clientInfo()) });
}

type PartnerUserRow = { id: string; partner_id: string; name: string; email: string; password_hash: string; expires_on: string; is_active: boolean; failed_count: number; locked_until: string | null; partners: { is_active: boolean; name: string } | null };

/** ① パスワードを確かめ、合っていればメールに6桁のコードを送る。間違いが続くと15分止める（どれが違うかは言わない） */
export async function startPartnerLogin(email: string, password: string): Promise<{ userId: string; email: string } | { error: string }> {
  const admin = createAdminClient();
  const generic = { error: "メールアドレスかパスワードが違います" };
  const { data: u } = await admin.from("partner_users").select("*, partners(is_active, name)").eq("email", email.trim().toLowerCase()).maybeSingle<PartnerUserRow>();
  if (!u) return generic;
  if (u.locked_until && Date.parse(u.locked_until) > Date.now()) return { error: "続けて間違えたため、しばらく入れません。15分ほどしてからお試しください" };
  if (!(await verifyPassword(password, u.password_hash))) {
    const fails = u.failed_count + 1;
    await admin
      .from("partner_users")
      .update({ failed_count: fails >= MAX_FAILS ? 0 : fails, locked_until: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null })
      .eq("id", u.id);
    await logPartner({ partnerId: u.partner_id, userId: u.id, action: "login_failed" });
    return generic;
  }
  if (!u.is_active || !u.partners?.is_active || u.expires_on < today()) return { error: "このIDは使えません（有効期限が切れたか、止められています）。担当の方にお問い合わせください" };
  await admin.from("partner_users").update({ failed_count: 0, locked_until: null }).eq("id", u.id);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await admin.from("partner_login_codes").update({ used_at: new Date().toISOString() }).eq("user_id", u.id).is("used_at", null);
  await admin.from("partner_login_codes").insert({ user_id: u.id, code_hash: sha256(`${u.id}:${code}`), expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString() });
  const { sendMail } = await import("@/lib/mail");
  await sendMail({
    to: u.email,
    subject: "【一鴻グループ】ログインの確認コード",
    text: `${u.name} 様\n\n一鴻グループの資料閲覧ページへのログインの確認コードです。\n\n　${code}\n\n${CODE_MINUTES}分以内に入力してください。お心当たりがない場合は、このメールを破棄してください。\n\n株式会社一鴻ホールディングス`,
  });
  return { userId: u.id, email: u.email };
}

/** ② 確認コードを確かめ、合っていればログイン中のクッキーを渡す */
export async function finishPartnerLogin(userId: string, code: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("partner_login_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!c || Date.parse(c.expires_at) < Date.now() || c.attempts >= 5) return { error: "確認コードの期限が切れました。最初からやり直してください" };
  if (c.code_hash !== sha256(`${userId}:${code.trim()}`)) {
    await admin.from("partner_login_codes").update({ attempts: c.attempts + 1 }).eq("id", c.id);
    return { error: "確認コードが違います" };
  }
  await admin.from("partner_login_codes").update({ used_at: new Date().toISOString() }).eq("id", c.id);
  const { data: u } = await admin.from("partner_users").select("id, partner_id").eq("id", userId).single();
  const token = randomBytes(32).toString("base64url");
  await admin.from("partner_sessions").insert({ user_id: userId, token_hash: sha256(token), expires_at: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(), ...(await clientInfo()) });
  await admin.from("partner_users").update({ last_login_at: new Date().toISOString() }).eq("id", userId);
  await logPartner({ partnerId: u?.partner_id ?? null, userId, action: "login" });
  const { data: who } = await admin.from("partner_users").select("name, partners(name)").eq("id", userId).maybeSingle<{ name: string; partners: { name: string } | null }>();
  const { notifyCeo } = await import("@/lib/partner-data");
  await notifyCeo(`【資料閲覧】${who?.partners?.name ?? ""} ${who?.name ?? ""}様がログインしました`);
  (await cookies()).set(PARTNER_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/exchange", maxAge: SESSION_HOURS * 3600 });
  return { ok: true };
}

export type PartnerUser = { id: string; name: string; email: string; partnerId: string; partnerName: string; sessionId: string };

/** ログイン中の取引先の担当者（期限切れ・止められた人・切れたログインは null） */
export async function getPartnerUser(): Promise<PartnerUser | null> {
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (!token) return null;
  const admin = createAdminClient();
  const { data: s } = await admin.from("partner_sessions").select("id, user_id, expires_at, revoked_at").eq("token_hash", sha256(token)).maybeSingle();
  if (!s || s.revoked_at || Date.parse(s.expires_at) < Date.now()) return null;
  const { data: u } = await admin.from("partner_users").select("*, partners(is_active, name)").eq("id", s.user_id).maybeSingle<PartnerUserRow>();
  if (!u || !u.is_active || !u.partners?.is_active || u.expires_on < today()) return null;
  return { id: u.id, name: u.name, email: u.email, partnerId: u.partner_id, partnerName: u.partners.name, sessionId: s.id };
}

export async function requirePartner() {
  const u = await getPartnerUser();
  if (!u) redirect("/exchange/login");
  return u;
}

export async function endPartnerSession() {
  const u = await getPartnerUser();
  if (u) {
    await createAdminClient().from("partner_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", u.sessionId);
    await logPartner({ partnerId: u.partnerId, userId: u.id, action: "logout" });
  }
  (await cookies()).delete({ name: PARTNER_COOKIE, path: "/exchange" });
}
