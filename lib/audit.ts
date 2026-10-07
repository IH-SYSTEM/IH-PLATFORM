import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction = "view" | "download" | "upload" | "create" | "update" | "delete" | "export";

/**
 * 操作ログを1件残す（追記のみ）。給与・マイナンバー・個人の書類を扱う処理からは必ず呼ぶ。
 * 記録に失敗しても本来の処理は止めない（ログの失敗で業務が止まらないように）が、サーバーのログには残す
 */
export async function audit(e: {
  actor: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  subject?: string | null;
  detail?: Record<string, unknown>;
}) {
  try {
    const h = await headers();
    const { error } = await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_staff_id: e.actor,
        action: e.action,
        target_type: e.targetType,
        target_id: e.targetId ?? null,
        subject_staff_id: e.subject ?? null,
        detail: e.detail ?? null,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
      });
    if (error) console.error("audit insert failed", error);
  } catch (err) {
    console.error("audit failed", err);
  }
}
