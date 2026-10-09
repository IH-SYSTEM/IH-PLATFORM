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
};

/** 見てよいか：管理者、または本人向けに公開された本人の書類 */
export function canView(me: CurrentStaff, f: FileRow) {
  if (f.status !== "ready") return false;
  return me.isAdmin || (f.owner_staff_id === me.id && f.visible_to_owner);
}

/** 保存場所のパス。推測できないように乱数を入れ、元のファイル名は使わない */
export function newPath(category: FileCategory, owner: string | null, contentType: string) {
  return `${category}/${owner ?? "_"}/${randomUUID()}.${ALLOWED_TYPES[contentType]}`;
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
