import "server-only";
import { randomUUID } from "node:crypto";
import type { CurrentStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET = "private-files";
export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// 会社の書類の保管庫で使えるファイル（Excel・Word・CSV も入れられる。50MB まで）
export const VAULT_MAX_BYTES = 50 * 1024 * 1024;
export const VAULT_TYPES: Record<string, string> = {
  ...ALLOWED_TYPES,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/csv": "csv",
};

// 会社の書類の種類（保管庫。2026-10-13）
export const VAULT_CATEGORIES = {
  corp_articles: { label: "定款" },
  corp_registry: { label: "登記簿謄本・印鑑証明" },
  corp_financials: { label: "決算書" },
  corp_tax: { label: "税務申告書・納税証明" },
  corp_minutes: { label: "議事録" },
  corp_contract: { label: "契約書（取引先・賃貸・リース）" },
  corp_license: { label: "許認可・届出" },
  corp_insurance: { label: "保険" },
  corp_bank: { label: "金融機関・借入" },
  corp_labor: { label: "労務（就業規則・36協定など）" },
  corp_data: { label: "データ（表）" },
  corp_other: { label: "その他" },
} as const;
export type VaultCategory = keyof typeof VAULT_CATEGORIES;
export const isVaultCategory = (v: unknown): v is VaultCategory => typeof v === "string" && v in VAULT_CATEGORIES;

/** 会社の書類を見る・入れる・消すことができる担当（経理・総務。代表はすべての担当を持つ扱い） */
export const VAULT_DUTIES = ["soumu", "keiri_input", "keiri_approve"] as const;
export const canUseVault = (me: CurrentStaff) => me.isAdmin && VAULT_DUTIES.some((d) => me.duties.includes(d));

// 書類の種類。label は画面に出す名前
export const FILE_CATEGORIES = {
  contract: { label: "雇用契約書・労働条件通知書" },
  withholding_slip: { label: "源泉徴収票" },
  tax_certificate: { label: "控除証明書（年末調整）" },
  certificate: { label: "在職証明書・給与証明書" },
  receipt: { label: "領収書" },
  report: { label: "報告の写真" },
  other: { label: "その他の書類" },
} as const;
export type FileCategory = keyof typeof FILE_CATEGORIES;
export const isFileCategory = (v: unknown): v is FileCategory => typeof v === "string" && v in FILE_CATEGORIES;

export type FileRow = {
  id: string;
  path: string;
  category: string;
  owner_staff_id: string | null;
  name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  visible_to_owner: boolean;
  uploaded_by: string;
  created_at: string;
  owner_company_id?: string | null;
  doc_date?: string | null;
  note?: string | null;
  ai_summary?: string | null;
  ai_error?: string | null;
  doc_kind?: string | null;
  owner_partner_id?: string | null;
  public_to_staff?: boolean;
};

/** 見てよいか：管理者、または本人向けに公開された本人の書類。会社の書類は経理・総務の担当だけ */
export function canView(me: CurrentStaff, f: FileRow) {
  if (f.status !== "ready") return false;
  // 会社の書類（保管庫）は、経理・総務の担当と代表だけ
  // ただし「全員に公開」にした会社の規程（就業規則など）は全員が見られる
  if (f.owner_company_id && f.public_to_staff) return true;
  if (f.owner_company_id || f.owner_partner_id) return canUseVault(me);
  return me.isAdmin || (f.owner_staff_id === me.id && f.visible_to_owner);
}

/** 保存場所のパス。推測できないように乱数を入れ、元のファイル名は使わない */
export function newPath(category: FileCategory | VaultCategory, owner: string | null, contentType: string) {
  return `${category}/${owner ?? "_"}/${randomUUID()}.${VAULT_TYPES[contentType]}`;
}

/** アップロード用の、1回だけ使えるURL（ブラウザから保存場所へ直接送る。Vercel の容量制限を通らない） */
export async function signedUploadFor(path: string) {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "signed upload url failed");
  return data; // { signedUrl, token, path }
}

/** 閲覧用の、短時間だけ有効なURL */
export async function signedDownloadFor(path: string, name: string, seconds = 60) {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, seconds, { download: name });
  if (error || !data) throw new Error(error?.message ?? "signed url failed");
  return data.signedUrl;
}

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/**
 * 会社の書類・データのファイル名を、中身に合わせて付け直す（2026-10-15 黒田さん「ファイル名は中身を見て適正なものに」）。
 * 形：「書類の名前_日付_会社」（例：決算書_2025-03-31_一鴻エンタテイメント.pdf）。表のデータは AI が付けた名前（期間入り）_会社。
 * 拡張子は元のまま。並べたときに、名前→日付の順にそろうようにする
 */
export function properFileName(opts: { original: string; docKind?: string | null; docDate?: string | null; title?: string | null; companyName?: string | null }) {
  const ext = opts.original.includes(".") ? opts.original.slice(opts.original.lastIndexOf(".")) : "";
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, " ").trim();
  const company = opts.companyName ? clean(opts.companyName.replace("株式会社", "")) : "";
  const parts = opts.title ? [clean(opts.title)] : [clean(opts.docKind || "書類"), opts.docDate ?? ""];
  const base = [...parts, company].filter(Boolean).join("_").slice(0, 120);
  return `${base || "書類"}${ext}`;
}
