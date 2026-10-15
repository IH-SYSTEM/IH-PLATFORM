import type { NextRequest } from "next/server";
import { signedDownloadFor } from "@/lib/files";
import { getPartnerUser, logPartner } from "@/lib/partner-auth";
import { notifyCeo, sharesOf } from "@/lib/partner-data";
import { createAdminClient } from "@/lib/supabase/admin";

// 取引先（銀行）が書類を開く。お渡しした書類か、その銀行から預かった書類だけ。記録を残し、代表に知らせてから、60秒だけ有効なURLへ移す
export async function GET(req: NextRequest, ctx: RouteContext<"/exchange/files/[id]">) {
  const me = await getPartnerUser();
  if (!me) return Response.redirect(new URL("/exchange/login", req.url), 302);
  const { id } = await ctx.params;
  const { data: f } = await createAdminClient().from("files").select("id, path, name, status, owner_partner_id").eq("id", id).maybeSingle();
  const { fileIds } = await sharesOf(me.partnerId);
  if (!f || f.status !== "ready" || !(fileIds.includes(f.id) || f.owner_partner_id === me.partnerId)) return new Response("この書類は表示できません", { status: 404 });
  await logPartner({ partnerId: me.partnerId, userId: me.id, action: "view_file", target: f.name });
  if (f.owner_partner_id !== me.partnerId) await notifyCeo(`【資料閲覧】${me.partnerName} ${me.name}様が書類を開きました：${f.name}`);
  return Response.redirect(await signedDownloadFor(f.path, f.name), 302);
}
