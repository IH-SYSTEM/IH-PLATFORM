import "server-only";
import type { PosReceipt } from "./airregi.ts";

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

type AmountRow = { hour: string; realTaxAmount: number; taxAmount: number; personNum: number; foodCount: number; discount: number; orderNum: number };
type PayRow = { hour: string; payTypeInfos?: { payTypeName: string; amount: number }[] };

/**
 * obanzai の売上を、1日1行の会計として読む（FUNFO の伝票の一覧には番号・時刻がないため、日の合計を使う）。
 * FUNFO の「1日」は開店（18時）から翌3時までで、こちらの営業日（6時切替）と同じ数え方。売上のない日（休み）は入れない
 */
export async function fetchFunfo(storeEmail: string, from: string, to: string): Promise<{ receipts: PosReceipt[]; raw: string; error?: string }> {
  const dates: string[] = [];
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) dates.push(d);
  const raw: Record<string, unknown> = {};
  const receipts: PosReceipt[] = [];
  for (let i = 0; i < dates.length; i += 5) {
    const got = await Promise.all(
      dates.slice(i, i + 5).map(async (date) => ({
        date,
        r: await funfoPost("/clientApi/statistics/v2/store/sale/data", { orderDate: date, orderType: 7, storeEmails: [storeEmail], userEmail: storeEmail }),
      })),
    );
    for (const { date, r } of got) {
      if (r.error) return { receipts: [], raw: "", error: r.error };
      if (r.json.retCode !== 0) return { receipts: [], raw: "", error: `FUNFO から読めませんでした（${date}・${r.json.retMsg ?? r.status}）` };
      raw[date] = r.json.data;
      const data = r.json.data as { amountHours?: AmountRow[]; payTypeHours?: PayRow[] };
      const day = data.amountHours?.find((h) => h.hour === date);
      if (!day || !(Number(day.realTaxAmount) > 0)) continue;
      const pay = data.payTypeHours?.find((h) => h.hour === date)?.payTypeInfos ?? [];
      receipts.push({
        receiptNo: `funfo-${date}`,
        businessDate: date,
        checkoutAt: `${date}T23:59:00+09:00`,
        total: Math.round(Number(day.realTaxAmount)),
        tax: Math.round(Number(day.taxAmount)),
        people: Number(day.personNum) || 0,
        items: Number(day.foodCount) || 0,
        discount: -Math.abs(Math.round(Number(day.discount) || 0)),
        payments: Object.fromEntries(pay.filter((p) => Number(p.amount) > 0).map((p) => [p.payTypeName, Math.round(Number(p.amount))])),
        cashier: "",
        slip: `${Number(day.orderNum) || 0}組`,
        lines: [],
      });
    }
  }
  return { receipts, raw: JSON.stringify(raw) };
}
