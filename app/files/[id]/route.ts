import type { NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canView, signedDownloadFor, type FileRow } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";

// 書類を開く。見てよい人か確かめ、操作ログを残してから、60秒だけ有効なURLへ移す
export async function GET(_req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const me = await getCurrentStaff();
  if (!me) return new Response("ログインが必要です", { status: 401 });
  const { id } = await ctx.params;
  const { data: f } = await createAdminClient().from("files").select("*").eq("id", id).maybeSingle<FileRow>();
  if (!f || !canView(me, f)) return new Response("この書類は表示できません", { status: 404 });
  await audit({ actor: me.id, action: "download", targetType: "file", targetId: f.id, subject: f.owner_staff_id, detail: { category: f.category, name: f.name } });
  return Response.redirect(await signedDownloadFor(f.path, f.name), 302);
}
