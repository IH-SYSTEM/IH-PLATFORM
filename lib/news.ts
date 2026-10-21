import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 全国ニュース（ホームの「全国ニュース」）を自動で集める（2026-10-21）。Yahoo!ニュースのトピックス（主要・経済）の見出しとリンクだけ。
 * 本文は持たない（記事は元のサイトで読む）。同じ記事は1回だけ。3日より古い自動のニュースは消す。本部が手で載せたニュースはそのまま
 */
const FEEDS = [
  { url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml", source: "Yahoo!ニュース（主要）" },
  { url: "https://news.yahoo.co.jp/rss/topics/business.xml", source: "Yahoo!ニュース（経済）" },
];
const AUTO = "Yahoo!ニュース";
const FRESH_MS = 60 * 60 * 1000; // 1時間に1回まで

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

type Item = { title: string; url: string; published: string; source: string };

async function readFeed(f: (typeof FEEDS)[number]): Promise<Item[]> {
  const res = await fetch(f.url, { cache: "no-store", headers: { "User-Agent": "IH-PLATFORM/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const pick = (tag: string) => decode(m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
      const url = pick("link").replace(/^http:/, "https:");
      const date = Date.parse(pick("pubDate"));
      return { title: pick("title").slice(0, 100), url, published: Number.isNaN(date) ? new Date().toISOString() : new Date(date).toISOString(), source: f.source };
    })
    .filter((i) => i.title && /^https:\/\//.test(i.url));
}

/** ニュースを取りに行く（前回から1時間たっていなければ何もしない。force で必ず） */
export async function refreshNews({ force = false } = {}) {
  const admin = createAdminClient();
  if (!force) {
    const { data: last } = await admin.from("announcements").select("created_at").eq("kind", "news").like("source", `${AUTO}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - Date.parse(last.created_at) < FRESH_MS) return { added: 0, skipped: "fresh" };
  }
  const items = (await Promise.all(FEEDS.map((f) => readFeed(f).catch(() => [])))).flat();
  if (!items.length) return { added: 0 };
  const { data: have } = await admin.from("announcements").select("url").eq("kind", "news").in("url", items.map((i) => i.url));
  const seen = new Set((have ?? []).map((h) => h.url));
  const fresh = items.filter((i, n) => !seen.has(i.url) && items.findIndex((x) => x.url === i.url) === n);
  if (fresh.length) {
    await admin.from("announcements").insert(fresh.map((i) => ({ kind: "news", title: i.title, url: i.url, source: i.source, audience: "all", published_at: i.published })));
  } else {
    // 新しい記事がなくても「取りに行った」印として、いちばん新しい自動ニュースの時刻を進める
    const { data: top } = await admin.from("announcements").select("id").eq("kind", "news").like("source", `${AUTO}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (top) await admin.from("announcements").update({ created_at: new Date().toISOString() }).eq("id", top.id);
  }
  await admin.from("announcements").delete().eq("kind", "news").like("source", `${AUTO}%`).lt("published_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
  return { added: fresh.length };
}
