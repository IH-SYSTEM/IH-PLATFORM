import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AnnouncementKind = "notice" | "system" | "news";
export const KIND_LABEL: Record<AnnouncementKind, string> = {
  notice: "会社からのお知らせ",
  system: "システムの更新",
  news: "全国ニュース",
};

export type Announcement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  url: string | null;
  source: string | null;
  audience: "all" | "company" | "store";
  audience_ids: string[];
  pinned: boolean;
  published_at: string;
};

/** その人に見せるお知らせ（全員向け＋自分の会社向け＋自分の店向け）。固定したものを先に、新しい順 */
export async function announcementsFor(staffId: string, kind: AnnouncementKind, limit: number): Promise<Announcement[]> {
  const admin = createAdminClient();
  const { data: me } = await admin.from("staff").select("store_id").eq("id", staffId).single();
  const { data: store } = me?.store_id ? await admin.from("stores").select("company_id").eq("id", me.store_id).maybeSingle() : { data: null };
  const { data } = await admin
    .from("announcements")
    .select("id, kind, title, body, url, source, audience, audience_ids, pinned, published_at")
    .eq("kind", kind)
    .lte("published_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit * 3);
  return ((data ?? []) as Announcement[])
    .filter(
      (a) =>
        a.audience === "all" ||
        (a.audience === "store" && !!me?.store_id && a.audience_ids.includes(me.store_id)) ||
        (a.audience === "company" && !!store?.company_id && a.audience_ids.includes(store.company_id)),
    )
    .slice(0, limit);
}
