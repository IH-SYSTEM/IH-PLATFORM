"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLine } from "@/lib/line-push";
import { resolveSegment } from "@/lib/line-segment";

export type PostState = { ok?: boolean; error?: string; line?: string; at?: number } | undefined;

const KINDS = ["notice", "system", "news"] as const;

/** お知らせ・システムの更新・ニュースを載せる（管理者のみ） */
export async function postAnnouncement(_prev: PostState, fd: FormData): Promise<PostState> {
  const me = await requireAdmin();
  const fail = (error: string) => ({ error, at: Date.now() });
  const get = (k: string) => String(fd.get(k) ?? "").trim();

  const kind = get("kind") as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return fail("種類を選んでください");
  const title = get("title");
  if (!title || title.length > 100) return fail("タイトルを100文字以内で入れてください");
  const body = get("body").slice(0, 2000) || null;
  const url = get("url") || null;
  if (url && !/^https:\/\/[^\s]+$/.test(url)) return fail("リンクは https:// から始まるURLを入れてください");
  if (kind === "news" && !url) return fail("ニュースは記事のリンクを入れてください");
  const source = get("source").slice(0, 50) || null;
  const audience = get("audience") === "company" ? "company" : get("audience") === "store" ? "store" : "all";
  const ids = audience === "all" ? [] : fd.getAll(audience === "company" ? "company_ids" : "store_ids").map(String).filter(Boolean);
  if (audience !== "all" && !ids.length) return fail(audience === "company" ? "会社を選んでください" : "店舗を選んでください");

  const { data, error } = await createAdminClient()
    .from("announcements")
    .insert({ kind, title, body, url, source, audience, audience_ids: ids, pinned: fd.get("pinned") === "on", created_by: me.id })
    .select("id")
    .single();
  if (error) {
    console.error("postAnnouncement failed", error);
    return fail("載せられませんでした");
  }
  await audit({ actor: me.id, action: "create", targetType: "announcement", targetId: data.id, detail: { kind, title } });
  revalidatePath("/");
  revalidatePath("/admin/announcements");

  // 「LINEでも送る」：ホームに出す相手と同じ人に送る
  if (fd.get("line") === "on") {
    const segment = audience === "company" ? { companies: ids } : audience === "store" ? { stores: ids } : {};
    const people = await resolveSegment(segment);
    const label = { notice: "お知らせ", system: "システムの更新", news: "ニュース" }[kind];
    const text = [`【${label}】${title}`, body ?? "", url ?? "", "", "IH ポータル：https://portal.ikkou-holdings.co.jp"].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n");
    const r = await sendLine({ kind: "announcement", text, recipients: people.map((p) => ({ staffId: p.id, lineUserId: p.lineUserId })), segment, createdBy: me.id });
    revalidatePath("/admin/line");
    return { ok: true, at: Date.now(), line: r.skipped ? `ホームには載せましたが、LINEは送れませんでした（${r.skipped}）` : `LINEで${r.sent}人に送りました` };
  }
  return { ok: true, at: Date.now() };
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const me = await requireAdmin();
  await createAdminClient().from("announcements").delete().eq("id", id);
  await audit({ actor: me.id, action: "delete", targetType: "announcement", targetId: id });
  revalidatePath("/");
  revalidatePath("/admin/announcements");
}
