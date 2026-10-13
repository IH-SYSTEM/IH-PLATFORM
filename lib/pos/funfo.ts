import "server-only";

// FUNFO（obanzai のレジ）の OpenAPI。公開鍵（clientId）と秘密鍵（clientSecret）でアクセストークンをもらい、
// それを Authorization: Bearer に付けて各 API を呼ぶ。鍵は Vercel の環境変数 FUNFO_PUBLIC_KEY / FUNFO_SECRET_KEY
const BASE = "https://openapi.funfo.jp/swo";

type Envelope = { retCode?: number; retMsg?: string; data?: unknown; [k: string]: unknown };

let cached: { token: string; until: number } | null = null;

/** 返ってきた形が分かるように、値を隠して形だけを見せる（調べる用） */
export function shape(v: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `(${v.length}件)`] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v;
}

/** アクセストークンをもらう。有効期限が分かればその少し前まで使い回す */
export async function funfoToken(): Promise<{ token?: string; error?: string; raw?: Envelope }> {
  if (cached && cached.until > Date.now()) return { token: cached.token };
  const clientId = process.env.FUNFO_PUBLIC_KEY;
  const clientSecret = process.env.FUNFO_SECRET_KEY;
  if (!clientId || !clientSecret) return { error: "FUNFO の鍵が設定されていません" };
  const res = await fetch(`${BASE}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Envelope;
  const data = (json.data ?? json) as Record<string, unknown>;
  const token = (data.accessToken ?? data.access_token ?? data.token) as string | undefined;
  if (!res.ok || !token) return { error: `トークンをもらえませんでした（HTTP ${res.status}・${json.retMsg ?? ""}）`, raw: json };
  const sec = Number(data.expiresIn ?? data.expires_in ?? 0);
  cached = { token, until: Date.now() + (sec > 120 ? (sec - 60) * 1000 : 10 * 60 * 1000) };
  return { token, raw: json };
}

/** 業務 API を呼ぶ（POST・JSON） */
export async function funfoPost(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Envelope; error?: string }> {
  const t = await funfoToken();
  if (!t.token) return { status: 0, json: {}, error: t.error };
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Envelope;
  return { status: res.status, json };
}
